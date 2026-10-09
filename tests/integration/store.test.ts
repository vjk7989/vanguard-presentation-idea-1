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
    expect(claims.find(x => x.status === "rejected")).toMatchObject({ reason: { code: "ROLE_TAKEN" } });
    const winner = claims[0].status === "fulfilled" ? a : b;
    await expect(store.claimRole(created.code, winner, randomUUID(), created.runId, "bank"))
      .rejects.toMatchObject({ code: "ROLE_ALREADY_CLAIMED" });
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

  it("counts profiles as distinct devices, but repeat joins from one session only once", async () => {
    const admin = `presenter-${randomUUID()}`;
    const created = await store.createRoom(admin, randomUUID());
    createdCodes.push(created.code);
    const issuer = `participant-${randomUUID()}`;
    const fund = `participant-${randomUUID()}`;
    const bank = `participant-${randomUUID()}`;
    const first = await store.joinRoom(created.code, issuer, created.runId);
    expect(await store.joinRoom(created.code, issuer, created.runId)).toEqual(first);
    await Promise.all([store.joinRoom(created.code, fund, created.runId), store.joinRoom(created.code, bank, created.runId)]);
    let room = await store.getSnapshot(created.code, admin);
    expect(room.presence).toMatchObject({ admins: 1, participants: 3, waiting: 3, assigned: 0 });
    expect(room.presence.devices).toHaveLength(3);
    await Promise.all([
      store.claimRole(created.code, issuer, randomUUID(), created.runId, "issuer"),
      store.claimRole(created.code, fund, randomUUID(), created.runId, "fund"),
      store.claimRole(created.code, bank, randomUUID(), created.runId, "bank"),
    ]);
    room = await store.getSnapshot(created.code, admin);
    expect(room.presence).toMatchObject({ admins: 1, participants: 3, waiting: 0, assigned: 3 });
    expect(room.roles.every(role => role.claimed && role.connected)).toBe(true);
    expect((await store.getSnapshot(created.code, fund)).presence.devices).toEqual([]);

    const staleSession = room.presence.devices.find(device => device.role === "bank")?.id;
    expect(staleSession).toBeTruthy();
    await dbModule.db().unsafe("UPDATE sessions SET last_seen_at=now() - interval '16 seconds' WHERE id=$1", [staleSession!]);
    room = await store.getSnapshot(created.code, admin);
    expect(room.presence).toMatchObject({ admins: 1, participants: 2, assigned: 2 });
    expect(room.presence.devices.find(device => device.id === staleSession)).toMatchObject({ role: "bank", connected: false });
    expect(room.roles.find(role => role.role === "bank")).toMatchObject({ claimed: true, connected: false });
    await store.getSnapshot(created.code, bank);
    room = await store.getSnapshot(created.code, admin);
    expect(room.presence).toMatchObject({ participants: 3, assigned: 3 });
  });

  it("serves snapshots while a mutation holds the room row lock", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const created = await store.createRoom(presenter, randomUUID());
    createdCodes.push(created.code);
    let releaseLock!: () => void;
    let signalLocked!: () => void;
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const hold = new Promise<void>(resolve => { releaseLock = resolve; });
    const blocker = dbModule.db().begin(async tx => {
      await tx.unsafe("SELECT id FROM rooms WHERE code=$1 FOR UPDATE", [created.code]);
      signalLocked();
      await hold;
    });
    try {
      await locked;
      const snapshot = await Promise.race([
        store.getSnapshot(created.code, presenter),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Snapshot waited for the room lock")), 1000)),
      ]);
      expect(snapshot.code).toBe(created.code);
    } finally {
      releaseLock();
      await blocker;
    }
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

  it("handles ten practice cases, retries, ordering, pause, and reset without moving money", async () => {
    const admin = `presenter-${randomUUID()}`;
    const created = await store.createRoom(admin, randomUUID());
    createdCodes.push(created.code);
    const fund = `participant-${randomUUID()}`;
    const bank = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, fund, created.runId);
    await store.joinRoom(created.code, bank, created.runId);
    await store.claimRole(created.code, fund, randomUUID(), created.runId, "fund");
    await store.claimRole(created.code, bank, randomUUID(), created.runId, "bank");
    await store.controlRoom(created.code, admin, randomUUID(), created.runId, "start");
    const opening = await store.getSnapshot(created.code, admin);
    const requestId = randomUUID();
    const [first, retry] = await Promise.all([
      store.createDemoCase(created.code, admin, requestId, created.runId, "10m", "issuer"),
      store.createDemoCase(created.code, admin, requestId, created.runId, "10m", "issuer"),
    ]);
    expect(retry).toEqual(first);
    for (let index = 1; index < 10; index++) {
      await store.createDemoCase(created.code, admin, randomUUID(), created.runId, "5m", "issuer");
    }
    let current = await store.getSnapshot(created.code, admin);
    expect(current.cases).toHaveLength(10);
    expect(current.cases.map(item => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(current.state.balances).toEqual(opening.state.balances);
    const caseId = current.cases[0].id;
    await expect(store.advanceDemoCase(created.code, bank, randomUUID(), created.runId, caseId, "bank_acknowledge"))
      .rejects.toThrow("Another team");
    const reviewId = randomUUID();
    const [review, reviewRetry] = await Promise.all([
      store.advanceDemoCase(created.code, fund, reviewId, created.runId, caseId, "fund_review"),
      store.advanceDemoCase(created.code, fund, reviewId, created.runId, caseId, "fund_review"),
    ]);
    expect(reviewRetry).toEqual(review);
    await store.controlRoom(created.code, admin, randomUUID(), created.runId, "pause");
    await expect(store.advanceDemoCase(created.code, bank, randomUUID(), created.runId, caseId, "bank_acknowledge"))
      .rejects.toThrow("Start or resume");
    await store.controlRoom(created.code, admin, randomUUID(), created.runId, "resume");
    await store.advanceDemoCase(created.code, bank, randomUUID(), created.runId, caseId, "bank_acknowledge");
    current = await store.getSnapshot(created.code, admin);
    expect(current.cases[0].status).toBe("bank_acknowledged");
    expect(current.state.balances).toEqual(opening.state.balances);
    expect((current.events.at(-1)?.stateAfter as { demoCases: Record<string, string> }).demoCases[current.cases[0].reference]).toBe("bank_acknowledged");
    const reset = await store.controlRoom(created.code, admin, randomUUID(), created.runId, "reset");
    const fresh = await store.getSnapshot(created.code, admin);
    expect(fresh.runId).toBe(reset.runId);
    expect(fresh.scenarioVersion).toBe(2);
    expect(fresh.cases).toHaveLength(0);
    await expect(store.createDemoCase(created.code, admin, randomUUID(), created.runId, "5m", "issuer"))
      .rejects.toThrow("earlier run");
    const replay = await store.getRunReplay(created.code, admin, created.runId);
    expect(replay.cases).toHaveLength(10);
    expect(replay.events.filter(item => item.type === "case_opened")).toHaveLength(10);
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

  it("switches ideas without losing sessions, role claims, or prior-run replay", async () => {
    const presenter = `presenter-${randomUUID()}`;
    const created = await store.createRoom(presenter, randomUUID());
    createdCodes.push(created.code);
    const first = `participant-${randomUUID()}`;
    const second = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, first, created.runId);
    await store.claimRole(created.code, first, randomUUID(), created.runId, "issuer");
    const switched = await store.controlRoom(created.code, presenter, randomUUID(), created.runId, "switch_idea", undefined, 2);
    expect(switched.runId).not.toBe(created.runId);
    let room = await store.getSnapshot(created.code, presenter);
    expect(room.ideaKey).toBe(2);
    expect(room.roles).toHaveLength(5);
    await store.joinRoom(created.code, second, switched.runId);
    const claims = await Promise.allSettled([
      store.claimRole(created.code, first, randomUUID(), switched.runId, "portfolio"),
      store.claimRole(created.code, second, randomUUID(), switched.runId, "portfolio"),
    ]);
    expect(claims.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const portfolioToken = claims[0].status === "fulfilled" ? first : second;
    await store.controlRoom(created.code, presenter, randomUUID(), switched.runId, "start");
    room = await store.getSnapshot(created.code, presenter);
    const beforeFinancial = await dbModule.db().unsafe("SELECT * FROM financial_states WHERE run_id=$1", [switched.runId]);
    const item = room.practiceItems.find(record => record.ownerRole === "portfolio");
    expect(item).toBeTruthy();
    const requestId = randomUUID();
    const practice = await store.performPracticeAction(created.code, portfolioToken, requestId, switched.runId, item!.itemKey, "acknowledge");
    expect(await store.performPracticeAction(created.code, portfolioToken, requestId, switched.runId, item!.itemKey, "acknowledge")).toEqual(practice);
    room = await store.getSnapshot(created.code, presenter);
    expect(room.practiceItems.find(record => record.itemKey === item!.itemKey)?.status).toBe("acknowledged");
    expect(await dbModule.db().unsafe("SELECT * FROM financial_states WHERE run_id=$1", [switched.runId])).toEqual(beforeFinancial);
    const guided = room.ideaActions.find(action => action.role === "portfolio");
    expect(guided).toBeTruthy();
    await store.performIdeaAction(created.code, portfolioToken, randomUUID(), switched.runId, guided!.id);
    const ideaTwoReplay = await store.getRunReplay(created.code, presenter, switched.runId);
    expect(ideaTwoReplay.events.some(event => event.type === guided!.id)).toBe(true);
    expect(ideaTwoReplay.events.every(event => typeof event.hash === "string" && event.stateAfter)).toBe(true);
    const back = await store.controlRoom(created.code, presenter, randomUUID(), switched.runId, "switch_idea", undefined, 1);
    expect(back.runId).toBe(created.runId);
    room = await store.getSnapshot(created.code, first);
    expect(room.session.role).toBe("issuer");
    expect(room.roles.find(role => role.role === "issuer")?.claimed).toBe(true);
    await expect(store.performIdeaAction(created.code, portfolioToken, randomUUID(), switched.runId, guided!.id)).rejects.toThrow("earlier run");
  });

  it("creates retry-safe routed practice tasks without changing money or rewriting old runs", async () => {
    const admin = `presenter-${randomUUID()}`;
    const created = await store.createRoom(admin, randomUUID());
    createdCodes.push(created.code);
    const issuer = `participant-${randomUUID()}`;
    const bank = `participant-${randomUUID()}`;
    await store.joinRoom(created.code, issuer, created.runId);
    await store.joinRoom(created.code, bank, created.runId);
    await store.claimRole(created.code, issuer, randomUUID(), created.runId, "issuer");
    await store.claimRole(created.code, bank, randomUUID(), created.runId, "bank");
    await store.controlRoom(created.code, admin, randomUUID(), created.runId, "start");
    const initial = await store.getSnapshot(created.code, admin);
    expect(initial.practiceItems.filter(item => item.ownerRole === "issuer")).toHaveLength(4);
    const beforeMoney = await dbModule.db().unsafe("SELECT * FROM financial_states WHERE run_id=$1", [created.runId]);
    const requestId = randomUUID();
    const response = await store.createPracticeTask(created.code, issuer, requestId, created.runId, "issuer-payee-review");
    expect(await store.createPracticeTask(created.code, issuer, requestId, created.runId, "issuer-payee-review")).toEqual(response);
    const after = await store.getSnapshot(created.code, admin);
    const item = after.practiceItems.find(entry => entry.itemKey.startsWith("LIVE-"));
    expect(item).toMatchObject({ ownerRole: "bank", counterpartyRole: "issuer", status: "pending" });
    expect(after.events.filter(event => event.type === "practice_created")).toHaveLength(1);
    expect(after.events.at(-1)?.route).toMatchObject({ source: "issuer", target: "bank", kind: "instruction" });
    expect(await dbModule.db().unsafe("SELECT * FROM financial_states WHERE run_id=$1", [created.runId])).toEqual(beforeMoney);
    await expect(store.createPracticeTask(created.code, bank, randomUUID(), created.runId, "issuer-payee-review")).rejects.toThrow("another desk");
    await store.performPracticeAction(created.code, bank, randomUUID(), created.runId, item!.itemKey, "acknowledge");
    for (let index = 0; index < 19; index++)
      await store.createPracticeTask(created.code, issuer, randomUUID(), created.runId, "issuer-liquidity-note");
    await expect(store.createPracticeTask(created.code, issuer, randomUUID(), created.runId, "issuer-liquidity-note"))
      .rejects.toThrow("20 new practice tasks");
    const replay = await store.getRunReplay(created.code, admin, created.runId);
    expect(replay.events.some(event => event.type === "practice_created")).toBe(true);
    const reset = await store.controlRoom(created.code, admin, randomUUID(), created.runId, "reset");
    expect((await store.getSnapshot(created.code, admin)).practiceItems.filter(entry => entry.itemKey.startsWith("LIVE-"))).toHaveLength(0);
    await expect(store.createPracticeTask(created.code, issuer, randomUUID(), created.runId, "issuer-payee-review")).rejects.toThrow("earlier run");
    expect((await store.getRunReplay(created.code, admin, created.runId)).events.slice(0, replay.events.length)).toEqual(replay.events);
    expect(reset.runId).not.toBe(created.runId);
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
