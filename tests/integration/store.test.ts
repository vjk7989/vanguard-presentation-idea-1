import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));
const testUrl = process.env.TEST_DATABASE_URL || process.env.NEON_TEST_DATABASE_URL || (process.env.ALLOW_DATABASE_TESTS === "1" ? process.env.DATABASE_URL : undefined);
const createdCodes: string[] = [];
let store: typeof import("../../src/lib/store");
let dbModule: typeof import("../../src/lib/db");

describe.skipIf(!testUrl)("PostgreSQL transaction integration", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdef";
    dbModule = await import("../../src/lib/db");
    store = await import("../../src/lib/store");
    for (const file of readdirSync(resolve("db")).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
      await dbModule.db().unsafe(readFileSync(resolve("db", file), "utf8"));
    }
  });
  afterAll(async () => {
    if (!dbModule) return;
    for (const code of createdCodes) await dbModule.db().unsafe("DELETE FROM rooms WHERE code=$1", [code]);
    await dbModule.db().end();
  });

  it("allows exactly one simultaneous claim for a role", async () => {
    const created = await store.createRoom(`presenter-${randomUUID()}`, randomUUID());
    createdCodes.push(created.code);
    const a = `participant-${randomUUID()}`;
    const b = `participant-${randomUUID()}`;
    await Promise.all([store.joinRoom(created.code, a, created.runId), store.joinRoom(created.code, b, created.runId)]);
    const claims = await Promise.allSettled([
      store.claimRole(created.code, a, randomUUID(), created.runId, "issuer"),
      store.claimRole(created.code, b, randomUUID(), created.runId, "issuer"),
    ]);
    expect(claims.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const count = await dbModule.db().unsafe("SELECT count(*)::int AS count FROM role_claims WHERE role='issuer' AND room_id=(SELECT id FROM rooms WHERE code=$1)", [created.code]);
    expect(count[0].count).toBe(1);
  });

  it("counts waiting devices and supports self-switch and admin kick", async () => {
    const admin = `presenter-${randomUUID()}`;
    const created = await store.createRoom(admin, randomUUID());
    createdCodes.push(created.code);
    const a = `participant-${randomUUID()}`;
    const b = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, a, created.runId);
    await store.joinRoom(created.code, b, created.runId);
    let state = await store.getSnapshot(created.code, admin);
    expect(state.presence.waiting).toBe(2);
    expect(state.presence.devices).toHaveLength(2);
    await store.claimRole(created.code, a, randomUUID(), created.runId, "issuer");
    await store.leaveRole(created.code, a, randomUUID(), created.runId);
    await store.claimRole(created.code, a, randomUUID(), created.runId, "fund");
    state = await store.getSnapshot(created.code, admin);
    expect(state.roles.find(role => role.role === "issuer")?.claimed).toBe(false);
    expect(state.roles.find(role => role.role === "fund")?.claimed).toBe(true);
    const waitingId = state.presence.devices.find(device => device.role === null)?.id;
    expect(waitingId).toBeTruthy();
    await store.kickDevice(created.code, admin, randomUUID(), created.runId, waitingId!);
    await expect(store.getSnapshot(created.code, b)).rejects.toThrow("Join this room");
  });

  it("persists fictional approvals without touching financial balances and resets them per run", async () => {
    const admin = `presenter-${randomUUID()}`;
    const created = await store.createRoom(admin, randomUUID());
    createdCodes.push(created.code);
    const treasury = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, treasury, created.runId);
    await store.claimRole(created.code, treasury, randomUUID(), created.runId, "issuer");
    await store.controlRoom(created.code, admin, randomUUID(), created.runId, "start");
    const before = await store.getSnapshot(created.code, admin);
    const requestId = randomUUID();
    const [first, retry] = await Promise.all([
      store.completeMockItem(created.code, treasury, requestId, created.runId, "iss-pay-01"),
      store.completeMockItem(created.code, treasury, requestId, created.runId, "iss-pay-01"),
    ]);
    expect(retry).toEqual(first);
    const after = await store.getSnapshot(created.code, admin);
    expect(after.state.balances).toEqual(before.state.balances);
    expect(after.mockItems.find(item => item.key === "iss-pay-01")?.status).toBe("complete");
    expect(after.events.filter(event => event.type === "mock_item_completed")).toHaveLength(1);
    expect((after.events.at(-1)?.stateAfter as { demoQueue: Record<string, string> }).demoQueue["iss-pay-01"]).toBe("complete");
    await expect(store.completeMockItem(created.code, treasury, randomUUID(), created.runId, "iss-pay-01")).rejects.toThrow("already complete");
    const reset = await store.controlRoom(created.code, admin, randomUUID(), created.runId, "reset");
    const fresh = await store.getSnapshot(created.code, admin);
    expect(fresh.runId).toBe(reset.runId);
    expect(fresh.mockItems.find(item => item.key === "iss-pay-01")?.status).toBe("pending");
    const prior = await store.getRunReplay(created.code, admin, created.runId);
    expect(prior.mockItems.find(item => item.key === "iss-pay-01")?.status).toBe("complete");
    await expect(store.completeMockItem(created.code, treasury, randomUUID(), created.runId, "iss-pay-02")).rejects.toThrow("earlier run");
  });

  it("keeps one public demo room and lets a kicked participant join again", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const preview = await store.roomPreview("DEMO01");
    const openId = randomUUID();
    const opened = await store.openDemoPresenter(presenter, openId);
    createdCodes.push(opened.code);
    expect(opened.runId).toBe(preview.runId);
    expect((await store.openDemoPresenter(presenter, openId)).code).toBe(opened.code);
    const otherPresenter = await store.openDemoPresenter(`presenter-${randomUUID()}`, randomUUID());
    expect(otherPresenter).toEqual(opened);
    const adminCount = (await store.getSnapshot(opened.code, presenter)).presence.admins;
    await store.openDemoPresenter(presenter, randomUUID());
    expect((await store.getSnapshot(opened.code, presenter)).presence.admins).toBe(adminCount);
    const first = `participant-${randomUUID()}`;
    await store.joinRoom(opened.code, first, opened.runId);
    await store.claimRole(opened.code, first, randomUUID(), opened.runId, "issuer");
    await store.releaseRole(opened.code, presenter, randomUUID(), opened.runId, "issuer");
    await expect(store.getSnapshot(opened.code, first)).rejects.toThrow("Join this room");
    const second = `participant-${randomUUID()}`;
    await store.joinRoom(opened.code, second, opened.runId);
    await store.claimRole(opened.code, second, randomUUID(), opened.runId, "issuer");
    expect((await store.getSnapshot(opened.code, second)).session.role).toBe("issuer");
    await store.controlRoom(opened.code, presenter, randomUUID(), opened.runId, "end");
    const late = `participant-${randomUUID()}`;
    await store.joinRoom(opened.code, late, opened.runId);
    await store.claimRole(opened.code, late, randomUUID(), opened.runId, "bank");
    expect((await store.getSnapshot(opened.code, late)).status).toBe("ended");
  });

  it("replays duplicate requests, prevents cross-role actions and rejects stale runs", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const created = await store.createRoom(presenter, randomUUID());
    createdCodes.push(created.code);
    await store.controlRoom(created.code, presenter, randomUUID(), created.runId, "start");
    const requestId = randomUUID();
    const [first, duplicate] = await Promise.all([
      store.performAction(created.code, presenter, requestId, created.runId, "request_redemption", "issuer"),
      store.performAction(created.code, presenter, requestId, created.runId, "request_redemption", "issuer"),
    ]);
    expect(duplicate).toEqual(first);
    const snapshot = await store.getSnapshot(created.code, presenter);
    expect(snapshot.state.step).toBe(1);
    expect(snapshot.events.filter(e => e.type === "request_redemption")).toHaveLength(1);
    const participant = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, participant, created.runId);
    await store.claimRole(created.code, participant, randomUUID(), created.runId, "bank");
    await expect(store.performAction(created.code, participant, randomUUID(), created.runId, "accept_redemption")).rejects.toThrow("role");
    const reset = await store.controlRoom(created.code, presenter, randomUUID(), created.runId, "reset");
    expect(reset.runId).not.toBe(created.runId);
    await expect(store.performAction(created.code, presenter, randomUUID(), created.runId, "request_redemption", "issuer")).rejects.toThrow("earlier run");
    const replay = await store.getRunReplay(created.code, presenter, created.runId);
    expect(replay.events.some(e => e.type === "request_redemption")).toBe(true);
    expect(replay.events.every(e => e.stateAfter && typeof e.stateAfter === "object")).toBe(true);
    expect(replay.closing).toEqual(snapshot.state.balances);
  });

  it("returns the original create and join results on retries across a reset", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const creationId = randomUUID();
    const created = await store.createRoom(presenter, creationId);
    createdCodes.push(created.code);
    expect(await store.createRoom(presenter, creationId)).toEqual(created);
    const participant = `participant-${randomUUID()}`;
    const joined = await store.joinRoom(created.code, participant, created.runId);
    expect(await store.joinRoom(created.code, participant, created.runId)).toEqual(joined);
    const reset = await store.controlRoom(created.code, presenter, randomUUID(), created.runId, "reset");
    expect(reset.runId).not.toBe(created.runId);
    expect(await store.joinRoom(created.code, participant, created.runId)).toEqual(joined);
    await expect(store.joinRoom(created.code, `late-${randomUUID()}`, created.runId)).rejects.toThrow("old run");
  });

  it("rolls back failed actions and cascades expired rooms", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const created = await store.createRoom(presenter, randomUUID());
    createdCodes.push(created.code);
    await store.controlRoom(created.code, presenter, randomUUID(), created.runId, "start");
    const before = await store.getSnapshot(created.code, presenter);
    await expect(store.performAction(created.code, presenter, randomUUID(), created.runId, "confirm_payouts", "bank"))
      .rejects.toThrow();
    const after = await store.getSnapshot(created.code, presenter);
    expect(after.revision).toBe(before.revision);
    expect(after.events).toEqual(before.events);
    const room = await dbModule.db().unsafe("UPDATE rooms SET expires_at=now() - interval '1 minute' WHERE code=$1 RETURNING id", [created.code]);
    expect(await store.cleanupExpired()).toBeGreaterThanOrEqual(1);
    const remaining = await dbModule.db().unsafe("SELECT count(*)::int AS count FROM runs WHERE room_id=$1", [room[0].id]);
    expect(remaining[0].count).toBe(0);
  });
});
