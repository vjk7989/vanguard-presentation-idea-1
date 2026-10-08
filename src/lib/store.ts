import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { db } from "./db";
import {
  ACTIONS, applyAction, DomainError, nextAction,
  OPENING_BALANCES, ROLES, serializeBalances, toWireState,
  type ActionType, type ControlType, type Mode, type Role, type RoomStatus,
  type ScenarioState, type SerializedBalances,
} from "./domain";
import { tokenHash } from "./security";
import { hashEvent } from "./ledger";

type Query = postgres.Sql | postgres.TransactionSql;
type Param = string | number | boolean | null;
async function rows<T>(query: Query, statement: string, params: Param[] = []): Promise<T[]> {
  return (await query.unsafe(statement, params)) as unknown as T[];
}
type RoomRow = { id: string; code: string; status: RoomStatus; mode: Mode; revision: string; active_run_id: string; expires_at: string };
type RunRow = { id: string; room_id: string; run_number: number; step: number; payout_approved: boolean; bank_delayed: boolean };
type SessionRow = { id: string; kind: "presenter" | "participant"; role: Role | null };
type BalanceRow = { cash_minor: string; fund_minor: string; pending_minor: string; obligations_minor: string };
type EventRow = { id: string; event_index: number; type: string; actor: string; on_behalf_of: Role | null; label: string; amount_minor: string | null; reference: string | null; previous_hash: string; event_hash: string; state_after: unknown; created_at: string };
type RequestRow = { response_json: unknown };

function jsonObject<T>(value: unknown): T {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object from Postgres.");
  return parsed as T;
}

export type WireEvent = {
  id: string; index: number; type: string; actor: string; onBehalfOf: Role | null;
  label: string; amount: string | null; reference: string | null;
  previousHash: string; hash: string; stateAfter: unknown; createdAt: string;
};
export type Snapshot = {
  code: string; runId: string; runNumber: number; revision: number; status: RoomStatus; mode: Mode;
  scenario: "Friday customer redemptions";
  state: ReturnType<typeof toWireState>;
  next: (typeof ACTIONS)[number] | null;
  roles: { role: Role; claimed: boolean; connected: boolean; walletId: string }[];
  session: { kind: "presenter" | "participant"; role: Role | null };
  events: WireEvent[];
  runs: { id: string; runNumber: number; createdAt: string; endedAt: string | null }[];
  serverTime: string;
};

function stateFrom(run: RunRow, financial: BalanceRow): ScenarioState {
  return {
    step: Number(run.step), payoutApproved: run.payout_approved, bankDelayed: run.bank_delayed,
    balances: {
      cash: BigInt(financial.cash_minor), fund: BigInt(financial.fund_minor),
      pending: BigInt(financial.pending_minor), obligations: BigInt(financial.obligations_minor),
      requiredBuffer: OPENING_BALANCES.requiredBuffer, plannedPayout: OPENING_BALANCES.plannedPayout,
      redemption: OPENING_BALANCES.redemption,
    },
  };
}

function eventWire(event: EventRow): WireEvent {
  return {
    id: event.id, index: Number(event.event_index), type: event.type, actor: event.actor,
    onBehalfOf: event.on_behalf_of, label: event.label, amount: event.amount_minor,
    reference: event.reference, previousHash: event.previous_hash, hash: event.event_hash,
    stateAfter: jsonObject(event.state_after), createdAt: event.created_at,
  };
}

async function roomByCode(query: Query, code: string, lock = false): Promise<RoomRow> {
  const found = await rows<RoomRow>(query,
    `SELECT id, code, status, mode, revision, active_run_id, expires_at FROM rooms WHERE code = $1 ${lock ? "FOR UPDATE" : ""}`,
    [code.toUpperCase()]);
  const room = found[0];
  if (!room || new Date(room.expires_at).getTime() <= Date.now()) throw new DomainError("ROOM_NOT_FOUND", "This room has expired or does not exist.", 404);
  return room;
}

async function sessionFor(query: Query, roomId: string, token: string): Promise<SessionRow> {
  const found = await rows<SessionRow>(query,
    `SELECT s.id, s.kind, rc.role FROM sessions s LEFT JOIN role_claims rc ON rc.session_id = s.id AND rc.room_id = s.room_id WHERE s.room_id = $1 AND s.token_hash = $2`,
    [roomId, tokenHash(token)]);
  if (!found[0]) throw new DomainError("NO_SESSION", "Join this room to continue.", 401);
  return found[0];
}

async function runAndState(query: Query, runId: string) {
  const run = (await rows<RunRow>(query, "SELECT * FROM runs WHERE id = $1", [runId]))[0];
  const financial = (await rows<BalanceRow>(query, "SELECT * FROM financial_states WHERE run_id = $1", [runId]))[0];
  if (!run || !financial) throw new DomainError("RUN_NOT_FOUND", "This run is unavailable.", 404);
  return { run, state: stateFrom(run, financial) };
}

async function appendEvent(tx: Query, room: RoomRow, run: RunRow, state: ScenarioState, event: {
  type: string; actor: string; onBehalfOf?: Role | null; label: string; amount?: bigint | null; reference?: string | null;
}) {
  const previous = (await rows<{ event_index: number; event_hash: string }>(tx,
    "SELECT event_index, event_hash FROM events WHERE run_id = $1 ORDER BY event_index DESC LIMIT 1", [run.id]))[0];
  const index = previous ? Number(previous.event_index) + 1 : 1;
  const previousHash = previous?.event_hash ?? "0".repeat(64);
  const createdAt = new Date().toISOString();
  const stateAfter = toWireState(state);
  const amount = event.amount?.toString() ?? null;
  const reference = event.reference ?? null;
  const hash = hashEvent({ runId: run.id, index, type: event.type, actor: event.actor, onBehalfOf: event.onBehalfOf ?? null, label: event.label,
    amount, reference, previousHash, stateAfter, createdAt });
  const id = randomUUID();
  await rows(tx, `INSERT INTO events (id, room_id, run_id, event_index, type, actor, on_behalf_of, label, amount_minor, reference, previous_hash, event_hash, state_after, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
    [id, room.id, run.id, index, event.type, event.actor, event.onBehalfOf ?? null, event.label, amount, reference,
      previousHash, hash, JSON.stringify(stateAfter), createdAt]);
  return { id, index, hash };
}

async function saveState(tx: Query, run: RunRow, state: ScenarioState) {
  await rows(tx, "UPDATE runs SET step = $2, payout_approved = $3, bank_delayed = $4 WHERE id = $1",
    [run.id, state.step, state.payoutApproved, state.bankDelayed]);
  await rows(tx, `UPDATE financial_states SET cash_minor=$2, fund_minor=$3, pending_minor=$4, obligations_minor=$5 WHERE run_id=$1`,
    [run.id, state.balances.cash.toString(), state.balances.fund.toString(),
      state.balances.pending.toString(), state.balances.obligations.toString()]);
}

async function insertRun(tx: Query, roomId: string, runNumber: number) {
  const id = randomUUID();
  await rows(tx, "INSERT INTO runs (id, room_id, run_number) VALUES ($1,$2,$3)", [id, roomId, runNumber]);
  const b = OPENING_BALANCES;
  await rows(tx, `INSERT INTO financial_states (run_id, cash_minor, fund_minor, pending_minor, obligations_minor) VALUES ($1,$2,$3,$4,$5)`,
    [id, b.cash.toString(), b.fund.toString(), b.pending.toString(), b.obligations.toString()]);
  return id;
}

export async function createRoom(token: string, requestId: string) {
  const sql = db();
  const existing = (await rows<RequestRow>(sql,
    "SELECT response_json FROM room_creation_requests WHERE request_id=$1", [requestId]))[0];
  if (existing) return jsonObject<{ code: string; runId: string }>(existing.response_json);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    try {
      return await sql.begin(async tx => {
        const id = randomUUID();
        await rows(tx, `INSERT INTO rooms (id, code, status, mode, expires_at) VALUES ($1,$2,'lobby','conventional', now() + interval '24 hours')`, [id, code]);
        const runId = await insertRun(tx, id, 1);
        await rows(tx, "UPDATE rooms SET active_run_id=$2 WHERE id=$1", [id, runId]);
        await rows(tx, "INSERT INTO sessions (id, room_id, token_hash, kind) VALUES ($1,$2,$3,'presenter')",
          [randomUUID(), id, tokenHash(token)]);
        const response = { code, runId };
        await rows(tx, "INSERT INTO room_creation_requests (request_id, room_id, response_json) VALUES ($1,$2,$3::jsonb)",
          [requestId, id, JSON.stringify(response)]);
        return response;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        const prior = (await rows<RequestRow>(sql,
          "SELECT response_json FROM room_creation_requests WHERE request_id=$1", [requestId]))[0];
        if (prior) return jsonObject<{ code: string; runId: string }>(prior.response_json);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique room code.");
}

export async function joinRoom(code: string, token: string, runId: string) {
  const sql = db();
  return sql.begin(async tx => {
    const room = await roomByCode(tx, code, true);
    const existing = await rows<{ join_run_id: string | null }>(tx, "SELECT join_run_id FROM sessions WHERE room_id=$1 AND token_hash=$2", [room.id, tokenHash(token)]);
    if (existing[0]) return { code: room.code.trim(), runId: existing[0].join_run_id ?? room.active_run_id };
    if (room.status === "ended") throw new DomainError("ROOM_ENDED", "This room has ended.");
    if (room.active_run_id !== runId) throw new DomainError("STALE_RUN", "This join link has an old run. Refresh the page.");
    await rows(tx, "INSERT INTO sessions (id, room_id, token_hash, kind, join_run_id) VALUES ($1,$2,$3,'participant',$4)",
      [randomUUID(), room.id, tokenHash(token), runId]);
    return { code: room.code.trim(), runId: room.active_run_id };
  });
}

export async function roomPreview(code: string) {
  const sql = db();
  const room = await roomByCode(sql, code);
  const claims = await rows<{ role: Role }>(sql, "SELECT role FROM role_claims WHERE room_id=$1", [room.id]);
  return { code: room.code.trim(), runId: room.active_run_id, status: room.status,
    roles: ROLES.map(role => ({ role, claimed: claims.some(c => c.role === role) })) };
}

export async function getSnapshot(code: string, token: string): Promise<Snapshot> {
  return db().begin(async tx => {
  const room = await roomByCode(tx, code, true);
  const session = await sessionFor(tx, room.id, token);
  await rows(tx, "UPDATE sessions SET last_seen_at = now() WHERE id = $1", [session.id]);
  const { run, state } = await runAndState(tx, room.active_run_id);
  const claims = await rows<{ role: Role; last_seen_at: string }>(tx,
    "SELECT rc.role, s.last_seen_at FROM role_claims rc JOIN sessions s ON s.id=rc.session_id WHERE rc.room_id=$1", [room.id]);
  const events = await rows<EventRow>(tx, "SELECT * FROM events WHERE run_id=$1 ORDER BY event_index", [run.id]);
  const runs = await rows<{ id: string; run_number: number; created_at: string; ended_at: string | null }>(tx,
    "SELECT id, run_number, created_at, ended_at FROM runs WHERE room_id=$1 ORDER BY run_number DESC", [room.id]);
  return {
    code: room.code.trim(), runId: run.id, runNumber: Number(run.run_number), revision: Number(room.revision),
    status: room.status, mode: room.mode, scenario: "Friday customer redemptions", state: toWireState(state),
    next: nextAction(state.step),
    roles: ROLES.map(role => {
      const claim = claims.find(c => c.role === role);
      return { role, claimed: Boolean(claim), connected: Boolean(claim && Date.now() - new Date(claim.last_seen_at).getTime() < 15_000),
        walletId: `DEMO-${role === "issuer" ? "ISS" : role === "fund" ? "FUND" : "BANK"}-${room.code.trim()}` };
    }),
    session: { kind: session.kind, role: session.role }, events: events.map(eventWire),
    runs: runs.map(r => ({ id: r.id, runNumber: Number(r.run_number), createdAt: r.created_at, endedAt: r.ended_at })),
    serverTime: new Date().toISOString(),
  };
  });
}

type MutationContext = { tx: postgres.TransactionSql; room: RoomRow; run: RunRow; state: ScenarioState; session: SessionRow };
type MutationResult = { ok: true; revision: number; runId: string; eventId?: string; message?: string };

async function mutate(code: string, token: string, requestId: string, runId: string,
  handler: (context: MutationContext) => Promise<{ eventId?: string; runId?: string; message?: string }>): Promise<MutationResult> {
  return db().begin(async tx => {
    const room = await roomByCode(tx, code, true);
    const session = await sessionFor(tx, room.id, token);
    const prior = (await rows<RequestRow>(tx, "SELECT response_json FROM mutation_requests WHERE room_id=$1 AND request_id=$2", [room.id, requestId]))[0];
    if (prior) return jsonObject<MutationResult>(prior.response_json);
    if (room.active_run_id !== runId) throw new DomainError("STALE_RUN", "This action belongs to an earlier run. Refresh the room.");
    const { run, state } = await runAndState(tx, runId);
    const outcome = await handler({ tx, room, run, state, session });
    const revision = Number(room.revision) + 1;
    await rows(tx, "UPDATE rooms SET revision=$2 WHERE id=$1", [room.id, revision]);
    const response: MutationResult = { ok: true, revision, runId: outcome.runId ?? runId,
      ...(outcome.eventId ? { eventId: outcome.eventId } : {}), ...(outcome.message ? { message: outcome.message } : {}) };
    await rows(tx, "INSERT INTO mutation_requests (room_id, request_id, run_id, response_json) VALUES ($1,$2,$3,$4::jsonb)",
      [room.id, requestId, runId, JSON.stringify(response)]);
    return response;
  });
}

export async function claimRole(code: string, token: string, requestId: string, runId: string, role: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (room.status !== "lobby" && room.status !== "active") throw new DomainError("ROOM_UNAVAILABLE", "Roles cannot be claimed now.");
    if (session.kind !== "participant") throw new DomainError("PRESENTER_ROLE", "Use a participant device to claim a role.", 403);
    if (!ROLES.includes(role)) throw new DomainError("BAD_ROLE", "Choose an available role.", 400);
    await rows(tx, "INSERT INTO role_claims (room_id, role, session_id) VALUES ($1,$2,$3)", [room.id, role, session.id]);
    const event = await appendEvent(tx, room, run, state, { type: "role_claimed", actor: role, label: `${role} joined the room.` });
    return { eventId: event.id };
  });
}

export async function releaseRole(code: string, token: string, requestId: string, runId: string, role: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (session.kind !== "presenter") throw new DomainError("PRESENTER_ONLY", "Only the presenter can release a role.", 403);
    await rows(tx, "DELETE FROM role_claims WHERE room_id=$1 AND role=$2", [room.id, role]);
    const event = await appendEvent(tx, room, run, state, { type: "role_released", actor: "presenter", onBehalfOf: role, label: `Presenter released ${role}.` });
    return { eventId: event.id };
  });
}

export async function performAction(code: string, token: string, requestId: string, runId: string,
  action: ActionType, onBehalfOf?: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (room.status !== "active") throw new DomainError("NOT_ACTIVE", "Start or resume the scenario before acting.");
    const role = session.kind === "presenter" ? onBehalfOf : session.role;
    if (!role) throw new DomainError("ROLE_REQUIRED", "Claim a role before acting.", 403);
    if (session.kind === "participant" && onBehalfOf) throw new DomainError("PRESENTER_ONLY", "Only the presenter can act on behalf of a role.", 403);
    const next = applyAction(state, action, role);
    await saveState(tx, run, next);
    const definition = ACTIONS[state.step];
    const amount = action === "request_redemption" || action === "process_redemption" || action === "confirm_proceeds"
      ? state.balances.redemption : action === "approve_payouts" || action === "confirm_payouts" ? state.balances.plannedPayout : null;
    const reference = action === "confirm_proceeds" ? `DEMO-BANK-${room.code.trim()}-R${run.run_number}`
      : action === "confirm_payouts" ? `DEMO-PAYOUT-${room.code.trim()}-R${run.run_number}`
      : `DEMO-${role.toUpperCase()}-${room.code.trim()}-${state.step + 1}`;
    const actor = session.kind === "presenter" ? "presenter" : role;
    const label = session.kind === "presenter" ? `${definition.result} Presenter acted on behalf of ${role}.` : definition.result;
    const event = await appendEvent(tx, room, run, next, { type: action, actor, onBehalfOf: session.kind === "presenter" ? role : null,
      label, amount, reference });
    return { eventId: event.id };
  });
}

export async function controlRoom(code: string, token: string, requestId: string, runId: string, control: ControlType, mode?: Mode) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (session.kind !== "presenter") throw new DomainError("PRESENTER_ONLY", "Only the presenter can use this control.", 403);
    let label = "";
    let nextRunId: string | undefined;
    if (control === "start") {
      if (room.status !== "lobby") throw new DomainError("WRONG_STATUS", "The scenario has already started.");
      await rows(tx, "UPDATE rooms SET status='active' WHERE id=$1", [room.id]);
      label = "Presenter started the Friday scenario.";
    } else if (control === "pause") {
      if (room.status !== "active") throw new DomainError("WRONG_STATUS", "Only an active scenario can be paused.");
      await rows(tx, "UPDATE rooms SET status='paused' WHERE id=$1", [room.id]);
      label = "Presenter paused the scenario.";
    } else if (control === "resume") {
      if (room.status !== "paused") throw new DomainError("WRONG_STATUS", "The scenario is not paused.");
      await rows(tx, "UPDATE rooms SET status='active' WHERE id=$1", [room.id]);
      label = "Presenter resumed the scenario.";
    } else if (control === "end") {
      await rows(tx, "UPDATE rooms SET status='ended' WHERE id=$1", [room.id]);
      await rows(tx, "UPDATE runs SET ended_at=now() WHERE id=$1 AND ended_at IS NULL", [run.id]);
      label = "Presenter ended the room.";
    } else if (control === "set_mode") {
      if (mode !== "conventional" && mode !== "ledger") throw new DomainError("BAD_MODE", "Choose a valid comparison mode.", 400);
      await rows(tx, "UPDATE rooms SET mode=$2 WHERE id=$1", [room.id, mode]);
      label = mode === "ledger" ? "Presenter revealed the simulated shared workflow ledger." : "Presenter selected separate records and reconciliation.";
    } else if (control === "delay_bank") {
      if (state.step !== 3) throw new DomainError("WRONG_STEP", "Delay bank confirmation after fund processing and before bank receipt.");
      state = { ...state, bankDelayed: true };
      await saveState(tx, run, state);
      label = "Bank confirmation delayed. $200m remains pending until the bank confirms receipt.";
    } else if (control === "release_bank") {
      if (!state.bankDelayed) throw new DomainError("NOT_DELAYED", "Bank confirmation is not delayed.");
      state = { ...state, bankDelayed: false };
      await saveState(tx, run, state);
      label = "Bank confirmation is available again.";
    } else if (control === "repeat_bank") {
      if (state.step < 4) throw new DomainError("NO_BANK_REFERENCE", "Confirm the incoming cash before repeating its notice.");
      label = "Duplicate bank notice received. The original reference was already applied. Cash did not change.";
    } else if (control === "reset") {
      await rows(tx, "UPDATE runs SET ended_at=now() WHERE id=$1 AND ended_at IS NULL", [run.id]);
      label = "Presenter restarted the scenario. Previous events remain available for replay.";
    } else throw new DomainError("BAD_CONTROL", "Unknown presenter control.", 400);
    const event = await appendEvent(tx, room, run, state, { type: control, actor: "presenter", label,
      reference: control === "repeat_bank" ? `DEMO-BANK-${room.code.trim()}-R${run.run_number}` : null });
    if (control === "reset") {
      nextRunId = await insertRun(tx, room.id, Number(run.run_number) + 1);
      await rows(tx, "UPDATE rooms SET active_run_id=$2, status='active' WHERE id=$1", [room.id, nextRunId]);
    }
    return { eventId: event.id, runId: nextRunId, message: label };
  });
}

export async function getRunReplay(code: string, token: string, runId: string) {
  const sql = db();
  const room = await roomByCode(sql, code);
  await sessionFor(sql, room.id, token);
  const run = (await rows<RunRow>(sql, "SELECT * FROM runs WHERE id=$1 AND room_id=$2", [runId, room.id]))[0];
  if (!run) throw new DomainError("RUN_NOT_FOUND", "This run is unavailable.", 404);
  const events = await rows<EventRow>(sql, "SELECT * FROM events WHERE run_id=$1 ORDER BY event_index", [runId]);
  const wireEvents = events.map(eventWire);
  return { runId, runNumber: Number(run.run_number), opening: serializeBalances(OPENING_BALANCES),
    events: wireEvents, closing: wireEvents.length ? (wireEvents.at(-1)?.stateAfter as { balances: SerializedBalances }).balances : serializeBalances(OPENING_BALANCES) };
}

export async function cleanupExpired() {
  const result = await rows<{ id: string }>(db(), "DELETE FROM rooms WHERE expires_at <= now() RETURNING id");
  return result.length;
}
