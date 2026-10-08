import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
    const migration = readFileSync(resolve("db/001_initial.sql"), "utf8");
    await dbModule.db().unsafe(migration);
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
