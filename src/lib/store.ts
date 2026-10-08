import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { db } from "./db";
import {
  actionsForVersion, applyAction, DomainError, nextAction,
  openingBalances, ROLES, serializeBalances, toWireState, formatMoney,
  type ActionType, type ControlType, type Mode, type Role, type RoomStatus,
  type ScenarioState, type ScenarioVersion, type SerializedBalances,
} from "./domain";
import { tokenHash } from "./security";
import { hashEvent } from "./ledger";
import { DEMO_ROOM_CODE } from "./demo";
import { fixtureByKey, MOCK_FIXTURES, MOCK_INITIAL_STATUS, type MockItem, type MockStatus } from "./mock-queue";
import { advanceCase, CASE_PRESETS, nextCaseRole, type CaseAction, type CasePreset, type CaseStatus, type DemoCase } from "./demo-cases";

type Query = postgres.Sql | postgres.TransactionSql;
type Param = string | number | boolean | null;
async function rows<T>(query: Query, statement: string, params: Param[] = []): Promise<T[]> {
  return (await query.unsafe(statement, params)) as unknown as T[];
}
type RoomRow = { id: string; code: string; status: RoomStatus; mode: Mode; revision: string; active_run_id: string; expires_at: string };
type RunRow = { id: string; room_id: string; run_number: number; scenario_version: ScenarioVersion; step: number; payout_approved: boolean; bank_delayed: boolean };
type SessionRow = { id: string; kind: "presenter" | "participant"; role: Role | null };
type BalanceRow = { cash_minor: string; fund_minor: string; pending_minor: string; obligations_minor: string };
type EventRow = { id: string; event_index: number; type: string; actor: string; on_behalf_of: Role | null; label: string; amount_minor: string | null; reference: string | null; previous_hash: string; event_hash: string; state_after: unknown; created_at: string };
type RequestRow = { response_json: unknown };
type QueueRow = { item_key: string; role: Role; status: MockStatus };
type CaseRow = { id: string; run_id: string; ordinal: number; reference: string; amount_minor: string; status: CaseStatus; created_at: string; updated_at: string };
type PresenceRow = { id: string; kind: "presenter" | "participant"; role: Role | null; last_seen_at: string };
type RunSummaryRow = { id: string; run_number: number; created_at: string; ended_at: string | null };
type SnapshotReadRow = RunRow & BalanceRow & Pick<RoomRow, "code" | "status" | "mode" | "revision"> & {
  session_kind: SessionRow["kind"] | null; session_role: Role | null;
  sessions: PresenceRow[]; queue: QueueRow[]; cases: CaseRow[]; events: EventRow[]; runs: RunSummaryRow[]; latest_event_index: number;
};

function jsonObject<T>(value: unknown): T {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object from Postgres.");
  return parsed as T;
}

function jsonArray<T>(value: unknown): T[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from Postgres.");
  return parsed as T[];
}

export type WireEvent = {
  id: string; index: number; type: string; actor: string; onBehalfOf: Role | null;
  label: string; amount: string | null; reference: string | null;
  previousHash: string; hash: string; stateAfter: unknown; createdAt: string;
};
export type Snapshot = {
  code: string; runId: string; runNumber: number; scenarioVersion: ScenarioVersion; revision: number; status: RoomStatus; mode: Mode;
  joinUrl?: string;
  scenario: "Friday customer redemptions";
  state: ReturnType<typeof toWireState>;
  next: ReturnType<typeof nextAction>;
  roles: { role: Role; claimed: boolean; connected: boolean; walletId: string }[];
  presence: { online: number; admins: number; participants: number; waiting: number; assigned: number;
    devices: { id: string; label: string; role: Role | null; connected: boolean }[] };
  mockItems: MockItem[];
  cases: DemoCase[];
  session: { kind: "presenter" | "participant"; role: Role | null };
  events: WireEvent[];
  latestEventIndex: number;
  runs: { id: string; runNumber: number; createdAt: string; endedAt: string | null }[];
  serverTime: string;
};
export type RoomPulse = {
  changed: false; code: string; runId: string; revision: number;
  roles: Snapshot["roles"]; presence: Snapshot["presence"]; serverTime: string;
};

async function queueRows(query: Query, runId: string): Promise<QueueRow[]> {
  return rows<QueueRow>(query, "SELECT item_key, role, status FROM demo_queue_items WHERE run_id=$1 ORDER BY item_key", [runId]);
}

async function caseRows(query: Query, runId: string): Promise<CaseRow[]> {
  return rows<CaseRow>(query, "SELECT id, run_id, ordinal, reference, amount_minor, status, created_at, updated_at FROM demo_cases WHERE run_id=$1 ORDER BY ordinal", [runId]);
}

function wireCase(row: CaseRow): DemoCase {
  return { id: row.id, ordinal: Number(row.ordinal), reference: row.reference, amount: row.amount_minor,
    status: row.status, nextRole: nextCaseRole(row.status), createdAt: row.created_at, updatedAt: row.updated_at };
}

function rolesFor(sessions: PresenceRow[], code: string): Snapshot["roles"] {
  return ROLES.map(role => {
    const claim = sessions.find(item => item.role === role);
    return { role, claimed: Boolean(claim), connected: Boolean(claim && Date.now() - new Date(claim.last_seen_at).getTime() < 15_000),
      walletId: `DEMO-${role === "issuer" ? "ISS" : role === "fund" ? "FUND" : "BANK"}-${code}` };
  });
}

function presenceFor(sessions: PresenceRow[], sessionKind: SessionRow["kind"]): Snapshot["presence"] {
  const online = sessions.filter(item => Date.now() - new Date(item.last_seen_at).getTime() < 15_000);
  const participants = online.filter(item => item.kind === "participant");
  return { online: online.length, admins: online.length - participants.length, participants: participants.length,
    waiting: participants.filter(item => !item.role).length, assigned: participants.filter(item => item.role).length,
    devices: sessionKind === "presenter" ? sessions.filter(item => item.kind === "participant")
      .map(item => ({ id: item.id, label: `Device ${item.id.slice(0, 6).toUpperCase()}`, role: item.role,
        connected: Date.now() - new Date(item.last_seen_at).getTime() < 15_000 })) : [] };
}

function wireQueue(rowsForRun: QueueRow[]): MockItem[] {
  return MOCK_FIXTURES.flatMap(fixture => {
    const row = rowsForRun.find(item => item.item_key === fixture.key);
    return row ? [{ ...fixture, status: row.status }] : [];
  });
}

function stateFrom(run: RunRow, financial: BalanceRow): ScenarioState {
  const opening = openingBalances(Number(run.scenario_version) === 2 ? 2 : 1);
  return {
    version: Number(run.scenario_version) === 2 ? 2 : 1,
    step: Number(run.step), payoutApproved: run.payout_approved, bankDelayed: run.bank_delayed,
    balances: {
      cash: BigInt(financial.cash_minor), fund: BigInt(financial.fund_minor),
      pending: BigInt(financial.pending_minor), obligations: BigInt(financial.obligations_minor),
      requiredBuffer: opening.requiredBuffer, plannedPayout: opening.plannedPayout,
      redemption: opening.redemption,
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

async function runAndState(query: Query, runId: string, lock = false) {
  const run = (await rows<RunRow>(query, `SELECT * FROM runs WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`, [runId]))[0];
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
  const queue = await queueRows(tx, run.id);
  const cases = await caseRows(tx, run.id);
  const stateAfter = { ...toWireState(state), demoQueue: Object.fromEntries(queue.map(item => [item.item_key, item.status])),
    demoCases: Object.fromEntries(cases.map(item => [item.reference, item.status])) };
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
  await rows(tx, "INSERT INTO runs (id, room_id, run_number, scenario_version) VALUES ($1,$2,$3,2)", [id, roomId, runNumber]);
  const b = openingBalances(2);
  await rows(tx, `INSERT INTO financial_states (run_id, cash_minor, fund_minor, pending_minor, obligations_minor) VALUES ($1,$2,$3,$4,$5)`,
    [id, b.cash.toString(), b.fund.toString(), b.pending.toString(), b.obligations.toString()]);
  for (const fixture of MOCK_FIXTURES) {
    await rows(tx, "INSERT INTO demo_queue_items (run_id, item_key, role, status) VALUES ($1,$2,$3,$4)",
      [id, fixture.key, fixture.role, MOCK_INITIAL_STATUS[fixture.key]]);
  }
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

/** The public demo uses one stable room; opening the controls only creates a new presenter session. */
export async function openDemoPresenter(token: string, requestId: string) {
  await ensureDemoRoom();
  return db().begin(async tx => {
    const room = await roomByCode(tx, DEMO_ROOM_CODE, true);
    const prior = (await rows<RequestRow>(tx, "SELECT response_json FROM mutation_requests WHERE room_id=$1 AND request_id=$2", [room.id, requestId]))[0];
    if (prior) return jsonObject<{ code: string; runId: string }>(prior.response_json);
    await rows(tx, `INSERT INTO sessions (id, room_id, token_hash, kind)
      VALUES ($1,$2,$3,'presenter') ON CONFLICT (token_hash) DO NOTHING`,
      [randomUUID(), room.id, tokenHash(token)]);
    const response = { code: DEMO_ROOM_CODE, runId: room.active_run_id };
    await rows(tx, "INSERT INTO mutation_requests (room_id, request_id, run_id, response_json) VALUES ($1,$2,$3,$4::jsonb)",
      [room.id, requestId, room.active_run_id, JSON.stringify(response)]);
    return response;
  });
}

export async function isDemoPresenterToken(token: string): Promise<boolean> {
  try {
    const room = await roomByCode(db(), DEMO_ROOM_CODE);
    return (await sessionFor(db(), room.id, token)).kind === "presenter";
  } catch (error) {
    if (error instanceof DomainError && (error.code === "ROOM_NOT_FOUND" || error.code === "NO_SESSION")) return false;
    throw error;
  }
}

async function ensureDemoRoom() {
  // The shared room is normally already present. Avoid opening a write transaction
  // for every QR preview and join after it has been initialized.
  try {
    const existing = await roomByCode(db(), DEMO_ROOM_CODE);
    if (new Date(existing.expires_at).getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) return existing;
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== "ROOM_NOT_FOUND") throw error;
  }
  return db().begin(async tx => {
    const id = randomUUID();
    const inserted = await rows<{ id: string }>(tx, `INSERT INTO rooms (id, code, status, mode, expires_at)
      VALUES ($1,$2,'lobby','conventional',now() + interval '100 years')
      ON CONFLICT (code) DO NOTHING RETURNING id`, [id, DEMO_ROOM_CODE]);
    if (inserted.length) {
      const runId = await insertRun(tx, id, 1);
      await rows(tx, "UPDATE rooms SET active_run_id=$2 WHERE id=$1", [id, runId]);
    }
    await rows(tx, "UPDATE rooms SET expires_at=now() + interval '100 years' WHERE code=$1 AND expires_at < now() + interval '1 year'", [DEMO_ROOM_CODE]);
    return roomByCode(tx, DEMO_ROOM_CODE);
  });
}

export async function joinRoom(code: string, token: string, runId: string, previousToken?: string) {
  const sql = db();
  const joinExistingRoom = () => sql.begin(async tx => {
    const room = await roomByCode(tx, code, true);
    const previous = previousToken ? await rows<{ kind: "presenter" | "participant" }>(tx,
      "SELECT kind FROM sessions WHERE room_id=$1 AND token_hash=$2", [room.id, tokenHash(previousToken)]) : [];
    if (previous[0]?.kind === "presenter") {
        throw new DomainError("ADMIN_SESSION", "This Chrome profile is already the admin. Open the QR link in another profile or device to choose a role.", 409);
    }
    const existing = await rows<{ join_run_id: string | null }>(tx, "SELECT join_run_id FROM sessions WHERE room_id=$1 AND token_hash=$2", [room.id, tokenHash(token)]);
    if (existing[0]) return { code: room.code.trim(), runId: existing[0].join_run_id ?? room.active_run_id, reused: previous[0]?.kind === "participant" };
    if (room.active_run_id !== runId) throw new DomainError("STALE_RUN", "This join link has an old run. Refresh the page.");
    if (previous[0]?.kind === "participant" && previousToken) {
      await rows(tx, "UPDATE sessions SET last_seen_at=now() WHERE room_id=$1 AND token_hash=$2", [room.id, tokenHash(previousToken)]);
      return { code: room.code.trim(), runId: room.active_run_id, reused: true };
    }
    await rows(tx, "INSERT INTO sessions (id, room_id, token_hash, kind, join_run_id) VALUES ($1,$2,$3,'participant',$4)",
      [randomUUID(), room.id, tokenHash(token), runId]);
    return { code: room.code.trim(), runId: room.active_run_id, reused: false };
  });
  try { return await joinExistingRoom(); }
  catch (error) {
    if (code.toUpperCase() !== DEMO_ROOM_CODE || !(error instanceof DomainError) || error.code !== "ROOM_NOT_FOUND") throw error;
    await ensureDemoRoom();
    return joinExistingRoom();
  }
}

export async function roomPreview(code: string) {
  const room = (await rows<Pick<RoomRow, "code" | "active_run_id" | "status" | "expires_at"> & { claimed_roles: Role[] }>(db(),
    `SELECT room.code, room.active_run_id, room.status, room.expires_at,
      (SELECT COALESCE(json_agg(role), '[]'::json) FROM role_claims WHERE room_id=room.id) AS claimed_roles
      FROM rooms room WHERE room.code=$1`, [code.toUpperCase()]))[0];
  const expiresAt = room ? new Date(room.expires_at).getTime() : 0;
  if (code.toUpperCase() === DEMO_ROOM_CODE && expiresAt <= Date.now() + 365 * 24 * 60 * 60 * 1000) {
    await ensureDemoRoom();
    return roomPreview(code);
  }
  if (!room || expiresAt <= Date.now()) throw new DomainError("ROOM_NOT_FOUND", "This room has expired or does not exist.", 404);
  const claimed = jsonArray<Role>(room.claimed_roles);
  return { code: room.code.trim(), runId: room.active_run_id, status: room.status,
    roles: ROLES.map(role => ({ role, claimed: claimed.includes(role) })) };
}

export async function getRoomPoll(code: string, token: string, afterRevision: number,
  afterEventIndex: number, knownRunId: string): Promise<Snapshot | RoomPulse> {
  const result = await rows<{ code: string; revision: string; active_run_id: string;
    session_kind: SessionRow["kind"] | null; sessions: PresenceRow[] }>(db(), `
    WITH target_room AS MATERIALIZED (
      SELECT id, code, revision, active_run_id FROM rooms WHERE code=$1 AND expires_at>now()
    ), heartbeat AS (
      UPDATE sessions s SET last_seen_at=now() FROM target_room room
      WHERE s.room_id=room.id AND s.token_hash=$2
      RETURNING s.id, s.kind, s.last_seen_at
    )
    SELECT room.code, room.revision, room.active_run_id, heartbeat.kind AS session_kind,
      (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'kind', s.kind,
        'last_seen_at', CASE WHEN s.id=heartbeat.id THEN heartbeat.last_seen_at ELSE s.last_seen_at END,
        'role', rc.role) ORDER BY s.created_at), '[]'::json)
        FROM sessions s LEFT JOIN role_claims rc ON rc.session_id=s.id AND rc.room_id=s.room_id
        WHERE s.room_id=room.id AND (s.id=heartbeat.id OR s.last_seen_at>=now()-interval '15 seconds' OR rc.role IS NOT NULL)
      ) AS sessions
    FROM target_room room LEFT JOIN heartbeat ON true`, [code.toUpperCase(), tokenHash(token)]);
  const row = result[0];
  if (!row) throw new DomainError("ROOM_NOT_FOUND", "This room has expired or does not exist.", 404);
  if (!row.session_kind) throw new DomainError("NO_SESSION", "Join this room to continue.", 401);
  const revision = Number(row.revision);
  if (revision !== afterRevision || row.active_run_id !== knownRunId) {
    return getSnapshot(code, token, row.active_run_id === knownRunId ? afterEventIndex : 0);
  }
  const sessions = jsonArray<PresenceRow>(row.sessions);
  return { changed: false, code: row.code.trim(), runId: row.active_run_id, revision,
    roles: rolesFor(sessions, row.code.trim()), presence: presenceFor(sessions, row.session_kind),
    serverTime: new Date().toISOString() };
}

export async function getSnapshot(code: string, token: string, afterEventIndex = 0): Promise<Snapshot> {
  // Polling must not lock the shared room: four devices refreshing every two seconds
  // would otherwise queue behind one another and behind financial mutations.
  // This statement also avoids a database round trip for every section of the view.
  const result = await rows<SnapshotReadRow>(db(), `
    WITH target_room AS MATERIALIZED (
      SELECT id, code, status, mode, revision, active_run_id
      FROM rooms WHERE code=$1 AND expires_at>now()
    ), heartbeat AS (
      UPDATE sessions s SET last_seen_at=now()
      FROM target_room room
      WHERE s.room_id=room.id AND s.token_hash=$2
      RETURNING s.id, s.kind, s.last_seen_at
    )
    SELECT run.id, run.room_id, run.run_number, run.scenario_version, run.step, run.payout_approved, run.bank_delayed,
      room.code, room.status, room.mode, room.revision,
      financial.cash_minor, financial.fund_minor, financial.pending_minor, financial.obligations_minor,
      heartbeat.kind AS session_kind,
      (SELECT role FROM role_claims WHERE room_id=room.id AND session_id=heartbeat.id) AS session_role,
      (SELECT COALESCE(json_agg(json_build_object(
        'id', s.id, 'kind', s.kind,
        'last_seen_at', CASE WHEN s.id=heartbeat.id THEN heartbeat.last_seen_at ELSE s.last_seen_at END,
        'role', rc.role) ORDER BY s.created_at), '[]'::json)
        FROM sessions s LEFT JOIN role_claims rc ON rc.session_id=s.id AND rc.room_id=s.room_id
        WHERE s.room_id=room.id AND (s.id=heartbeat.id OR s.last_seen_at>=now()-interval '15 seconds' OR rc.role IS NOT NULL)
      ) AS sessions,
      (SELECT COALESCE(json_agg(json_build_object('item_key', item_key, 'role', role, 'status', status) ORDER BY item_key), '[]'::json)
        FROM demo_queue_items WHERE run_id=run.id) AS queue,
      (SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.ordinal), '[]'::json)
        FROM demo_cases c WHERE c.run_id=run.id) AS cases,
      (SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.event_index), '[]'::json)
        FROM events e WHERE e.run_id=run.id AND e.event_index>$3) AS events,
      (SELECT COALESCE(MAX(e.event_index),0) FROM events e WHERE e.run_id=run.id) AS latest_event_index,
      (SELECT COALESCE(json_agg(json_build_object('id', id, 'run_number', run_number,
        'created_at', created_at, 'ended_at', ended_at) ORDER BY run_number DESC), '[]'::json)
        FROM runs WHERE room_id=room.id) AS runs
    FROM target_room room
    LEFT JOIN heartbeat ON true
    JOIN runs run ON run.id=room.active_run_id
    JOIN financial_states financial ON financial.run_id=run.id`, [code.toUpperCase(), tokenHash(token), afterEventIndex]);
  const row = result[0];
  if (!row) {
    await roomByCode(db(), code);
    throw new DomainError("RUN_NOT_FOUND", "This run is unavailable.", 404);
  }
  if (!row.session_kind) throw new DomainError("NO_SESSION", "Join this room to continue.", 401);
  const state = stateFrom(row, row);
  const sessions = jsonArray<PresenceRow>(row.sessions);
  const queue = jsonArray<QueueRow>(row.queue);
  const cases = jsonArray<CaseRow>(row.cases);
  const events = jsonArray<EventRow>(row.events);
  const runs = jsonArray<RunSummaryRow>(row.runs);
  const session = { kind: row.session_kind, role: row.session_role };
  return {
    code: row.code.trim(), runId: row.id, runNumber: Number(row.run_number), scenarioVersion: state.version, revision: Number(row.revision),
    status: row.status, mode: row.mode, scenario: "Friday customer redemptions", state: toWireState(state),
    next: nextAction(state.step, state.version),
    roles: rolesFor(sessions, row.code.trim()),
    presence: presenceFor(sessions, session.kind),
    mockItems: wireQueue(queue),
    cases: cases.map(wireCase),
    session, events: events.map(eventWire), latestEventIndex: Number(row.latest_event_index),
    runs: runs.map(r => ({ id: r.id, runNumber: Number(r.run_number), createdAt: r.created_at, endedAt: r.ended_at })),
    serverTime: new Date().toISOString(),
  };
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
    const { run, state } = await runAndState(tx, runId, true);
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
    if (session.kind !== "participant") throw new DomainError("PRESENTER_ROLE", "Use a participant device to claim a role.", 403);
    if (!ROLES.includes(role)) throw new DomainError("BAD_ROLE", "Choose an available role.", 400);
    await rows(tx, "INSERT INTO role_claims (room_id, role, session_id) VALUES ($1,$2,$3)", [room.id, role, session.id]);
    const event = await appendEvent(tx, room, run, state, { type: "role_claimed", actor: role, label: `${role} joined the room.` });
    return { eventId: event.id };
  });
}

export async function releaseRole(code: string, token: string, requestId: string, runId: string, role: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (session.kind !== "presenter") throw new DomainError("PRESENTER_ONLY", "Only the presenter can remove a participant.", 403);
    const claim = (await rows<{ session_id: string }>(tx, "SELECT session_id FROM role_claims WHERE room_id=$1 AND role=$2", [room.id, role]))[0];
    if (!claim) throw new DomainError("ROLE_AVAILABLE", "This role is already available.", 409);
    await rows(tx, "DELETE FROM sessions WHERE id=$1 AND room_id=$2", [claim.session_id, room.id]);
    const event = await appendEvent(tx, room, run, state, { type: "role_released", actor: "presenter", onBehalfOf: role, label: `Presenter removed ${role}. They may rejoin using the QR link.` });
    return { eventId: event.id };
  });
}

export async function leaveRole(code: string, token: string, requestId: string, runId: string) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (session.kind !== "participant" || !session.role) throw new DomainError("ROLE_REQUIRED", "Choose a role before leaving it.", 403);
    await rows(tx, "DELETE FROM role_claims WHERE room_id=$1 AND session_id=$2", [room.id, session.id]);
    const event = await appendEvent(tx, room, run, state,
      { type: "role_left", actor: session.role, label: `${session.role} returned to role selection.` });
    return { eventId: event.id, message: "Role released. Choose another available role." };
  });
}

export async function kickDevice(code: string, token: string, requestId: string, runId: string, sessionId: string) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (session.kind !== "presenter") throw new DomainError("PRESENTER_ONLY", "Only an admin can remove a device.", 403);
    const target = (await rows<{ role: Role | null }>(tx, `SELECT rc.role FROM sessions s
      LEFT JOIN role_claims rc ON rc.room_id=s.room_id AND rc.session_id=s.id
      WHERE s.id=$1 AND s.room_id=$2 AND s.kind='participant'`, [sessionId, room.id]))[0];
    if (!target) throw new DomainError("DEVICE_NOT_FOUND", "This participant has already left.", 404);
    await rows(tx, "DELETE FROM sessions WHERE id=$1 AND room_id=$2 AND kind='participant'", [sessionId, room.id]);
    const event = await appendEvent(tx, room, run, state, { type: "device_kicked", actor: "presenter",
      onBehalfOf: target.role, label: `Admin removed a ${target.role ?? "waiting"} device. It may rejoin using the QR link.` });
    return { eventId: event.id, message: "Device removed. It can rejoin with the QR link." };
  });
}

export async function completeMockItem(code: string, token: string, requestId: string, runId: string, itemKey: string) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (room.status !== "active") throw new DomainError("NOT_ACTIVE", "Start or resume the scenario before reviewing work.");
    const fixture = fixtureByKey(itemKey);
    if (!fixture) throw new DomainError("ITEM_NOT_FOUND", "This simulated work item does not exist.", 404);
    if (session.kind !== "participant" || session.role !== fixture.role)
      throw new DomainError("WRONG_ROLE", "This item belongs to another team.", 403);
    const item = (await rows<QueueRow>(tx, "SELECT item_key, role, status FROM demo_queue_items WHERE run_id=$1 AND item_key=$2 FOR UPDATE",
      [run.id, itemKey]))[0];
    if (!item) throw new DomainError("ITEM_NOT_FOUND", "This item is not in the current run.", 404);
    if (item.status === "complete") throw new DomainError("ALREADY_COMPLETE", "This item is already complete.");
    await rows(tx, "UPDATE demo_queue_items SET status='complete', updated_at=now() WHERE run_id=$1 AND item_key=$2", [run.id, itemKey]);
    const event = await appendEvent(tx, room, run, state, { type: "mock_item_completed", actor: fixture.role,
      label: `${fixture.completedLabel}: ${fixture.title} (${fixture.reference}). Simulated background item; reserve balances unchanged.`,
      reference: fixture.reference });
    return { eventId: event.id, message: `${fixture.title} ${fixture.completedLabel.toLowerCase()}. Reserve balances did not change.` };
  });
}

export async function createDemoCase(code: string, token: string, requestId: string, runId: string,
  preset: CasePreset, onBehalfOf?: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (room.status !== "active") throw new DomainError("NOT_ACTIVE", "Start or resume the scenario before opening a practice case.");
    if (!(preset in CASE_PRESETS)) throw new DomainError("BAD_PRESET", "Choose a practice amount.", 400);
    if (session.kind === "participant" && (session.role !== "issuer" || onBehalfOf))
      throw new DomainError("WRONG_ROLE", "Only Issuer Treasury can open a practice case.", 403);
    if (session.kind === "presenter" && onBehalfOf !== "issuer")
      throw new DomainError("ROLE_REQUIRED", "Select Issuer Treasury for presenter takeover.", 403);
    const prior = await caseRows(tx, run.id);
    const ordinal = prior.length + 1;
    if (ordinal > 20) throw new DomainError("CASE_LIMIT", "This run already has 20 practice cases. Restart for a fresh queue.");
    const reference = `SIM-R${run.run_number}-C${String(ordinal).padStart(2, "0")}`;
    const amount = CASE_PRESETS[preset];
    await rows(tx, `INSERT INTO demo_cases (id, run_id, ordinal, reference, amount_minor, status)
      VALUES ($1,$2,$3,$4,$5,'opened')`, [randomUUID(), run.id, ordinal, reference, amount]);
    const event = await appendEvent(tx, room, run, state, { type: "case_opened",
      actor: session.kind === "presenter" ? "presenter" : "issuer",
      onBehalfOf: session.kind === "presenter" ? "issuer" : null,
      label: `Practice request ${reference}: Issuer sent ${formatMoney(amount)} to Fund for review. No cash moved.`, reference });
    return { eventId: event.id, message: `${reference} sent to Fund. Practice only; reserve balances did not change.` };
  });
}

export async function advanceDemoCase(code: string, token: string, requestId: string, runId: string,
  caseId: string, action: CaseAction, onBehalfOf?: Role) {
  return mutate(code, token, requestId, runId, async ({ tx, room, run, state, session }) => {
    if (room.status !== "active") throw new DomainError("NOT_ACTIVE", "Start or resume the scenario before reviewing practice cases.");
    if (session.kind === "participant" && onBehalfOf)
      throw new DomainError("PRESENTER_ONLY", "Only an admin can act on behalf of a role.", 403);
    const role = session.kind === "presenter" ? onBehalfOf : session.role;
    if (!role) throw new DomainError("ROLE_REQUIRED", "Choose a role before acting.", 403);
    const row = (await rows<CaseRow>(tx, `SELECT id, run_id, ordinal, reference, amount_minor, status, created_at, updated_at
      FROM demo_cases WHERE id=$1 AND run_id=$2 FOR UPDATE`, [caseId, run.id]))[0];
    if (!row) throw new DomainError("CASE_NOT_FOUND", "This practice case is not in the current run.", 404);
    const nextStatus = advanceCase(row.status, action, role);
    await rows(tx, "UPDATE demo_cases SET status=$3, updated_at=now() WHERE id=$1 AND run_id=$2", [caseId, run.id, nextStatus]);
    const label = nextStatus === "fund_reviewed"
      ? `Practice request ${row.reference}: Fund reviewed ${formatMoney(row.amount_minor)} and asked Bank for a status message. No cash moved.`
      : `Practice request ${row.reference}: Bank acknowledged the status to Issuer. No cash moved.`;
    const event = await appendEvent(tx, room, run, state, { type: nextStatus === "fund_reviewed" ? "case_fund_reviewed" : "case_bank_acknowledged",
      actor: session.kind === "presenter" ? "presenter" : role,
      onBehalfOf: session.kind === "presenter" ? role : null, label, reference: row.reference });
    return { eventId: event.id, message: `${row.reference} updated. Practice only; reserve balances did not change.` };
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
    const definition = actionsForVersion(state.version)[state.step];
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
      label = "Presenter ended this run. The demo room remains open.";
    } else if (control === "set_mode") {
      if (mode !== "conventional" && mode !== "ledger") throw new DomainError("BAD_MODE", "Choose a valid comparison mode.", 400);
      await rows(tx, "UPDATE rooms SET mode=$2 WHERE id=$1", [room.id, mode]);
      label = mode === "ledger" ? "Presenter revealed the simulated shared workflow ledger." : "Presenter selected separate records and reconciliation.";
    } else if (control === "delay_bank") {
      if (state.step !== 3) throw new DomainError("WRONG_STEP", "Delay bank confirmation after fund processing and before bank receipt.");
      state = { ...state, bankDelayed: true };
      await saveState(tx, run, state);
      label = `Bank confirmation delayed. ${formatMoney(state.balances.redemption)} remains pending until the bank confirms receipt.`;
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
  const queue = await queueRows(sql, runId);
  const cases = await caseRows(sql, runId);
  const opening = serializeBalances(openingBalances(Number(run.scenario_version) === 2 ? 2 : 1));
  return { runId, runNumber: Number(run.run_number), scenarioVersion: Number(run.scenario_version), opening,
    events: wireEvents, mockItems: wireQueue(queue), cases: cases.map(wireCase),
    closing: wireEvents.length ? (wireEvents.at(-1)?.stateAfter as { balances: SerializedBalances }).balances : opening };
}

export async function cleanupExpired() {
  const result = await rows<{ id: string }>(db(), "DELETE FROM rooms WHERE expires_at <= now() RETURNING id");
  await rows(db(), `DELETE FROM sessions WHERE room_id IN (SELECT id FROM rooms WHERE code=$1)
    AND last_seen_at < now() - interval '24 hours'`, [DEMO_ROOM_CODE]);
  return result.length;
}
