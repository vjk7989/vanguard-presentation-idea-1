import type { Page } from "@playwright/test";
import type { Snapshot, WireEvent } from "../../src/lib/store";
import type { Role } from "../../src/lib/domain";
import { MOCK_FIXTURES, MOCK_INITIAL_STATUS } from "../../src/lib/mock-queue";

export const CODE = "DEMO01";
export const RUN_ID = "11111111-1111-4111-8111-111111111111";
const balances = { cash: "30000000000", fund: "155000000000", pending: "15000000000", obligations: "200000000000", requiredBuffer: "0", plannedPayout: "45000000000", redemption: "15000000000" };
const event = (index: number, type: string, label: string, actor: string): WireEvent => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, index, type, actor, onBehalfOf: null, label,
  amount: "15000000000", reference: `DEMO-ISS-DEMO01-${index}`, previousHash: "0".repeat(64), hash: String(index).repeat(64),
  stateAfter: { step: index, balances }, createdAt: `2026-10-09T00:0${index}:00.000Z` });

export function snapshot(kind: "presenter" | "participant", role: Role | null, status: Snapshot["status"] = "active"): Snapshot {
  const lobby = status === "lobby";
  return { code: CODE, runId: RUN_ID, runNumber: 1, ideaKey: 1, ideaState: {}, ideaActions: [], scenarioVersion: 2, revision: 3, status, mode: "conventional", scenario: "Friday customer redemptions", joinUrl: `https://vanguard-presentation-idea-1.vercel.app/join/${CODE}`,
    state: { version: 2, step: lobby ? 0 : 3, balances: lobby ? { ...balances, fund: "170000000000", pending: "0" } : balances, payoutApproved: false, bankDelayed: false },
    next: lobby ? { type: "request_redemption", role: "issuer", label: "Request $150m fund cash", result: "Issuer requested $150m." } : { type: "confirm_proceeds", role: "bank", label: "Confirm incoming $150m", result: "Bank confirmed receipt." },
    roles: (["issuer", "fund", "bank"] as Role[]).map(r => ({ role: r, claimed: !lobby || r === "issuer", connected: !lobby || r === "issuer", walletId: `DEMO-${r.toUpperCase()}-${CODE}` })),
    presence: { online: 2, admins: kind === "presenter" ? 1 : 0, participants: kind === "presenter" ? 1 : 2, waiting: 0, assigned: kind === "presenter" ? 1 : 2,
      devices: kind === "presenter" ? [{ id: "22222222-2222-4222-8222-222222222222", label: "Device 222222", role: "issuer", connected: true }] : [] },
    mockItems: MOCK_FIXTURES.map(item => ({ ...item, status: MOCK_INITIAL_STATUS[item.key] })), cases: [], practiceItems: [],
    session: { kind, role }, events: lobby ? [] : [event(1, "request_redemption", "Issuer requested $150m. Balances have not changed.", "issuer"), event(2, "accept_redemption", "Fund operator accepted the request. Bank cash remains $300m.", "fund"), event(3, "process_redemption", "Fund holdings fell to $1.55bn. $150m proceeds are pending.", "fund")], latestEventIndex: lobby ? 0 : 3,
    runs: [{ id: RUN_ID, runNumber: 1, ideaKey: 1, createdAt: "2026-10-09T00:00:00.000Z", endedAt: null }], serverTime: "2026-10-09T00:04:00.000Z" };
}

export async function mockRoom(page: Page, data: Snapshot) {
  await page.route(`**/api/rooms/${CODE}/**`, route => {
    const body = route.request().postDataJSON() as { control?: string; mode?: Snapshot["mode"]; role?: Role; action?: string; sessionId?: string; preset?: string } | null;
    if (body?.control === "set_mode" && body.mode) data.mode = body.mode;
    if (body?.control === "delay_bank") data.state.bankDelayed = true;
    if (body?.control === "release_bank") data.state.bankDelayed = false;
    if (body?.control === "start") data.status = "active";
    if (body?.role && route.request().url().endsWith("/roles/claim")) {
      data.session.role = body.role;
      const role = data.roles.find(r => r.role === body.role);
      if (role) { role.claimed = true; role.connected = true; }
    }
    if (body?.role && route.request().url().endsWith("/roles/release")) {
      const role = data.roles.find(r => r.role === body.role);
      if (role) { role.claimed = false; role.connected = false; }
    }
    if (route.request().url().endsWith("/roles/leave")) {
      const prior = data.session.role;
      data.session.role = null;
      const role = data.roles.find(r => r.role === prior);
      if (role) { role.claimed = false; role.connected = false; }
    }
    if (body?.sessionId && route.request().url().endsWith("/sessions/kick")) {
      const device = data.presence.devices.find(item => item.id === body.sessionId);
      data.presence.devices = data.presence.devices.filter(item => item.id !== body.sessionId);
      data.presence.participants--; data.presence.online--;
      if (device?.role) data.presence.assigned--; else data.presence.waiting--;
      const role = data.roles.find(item => item.role === device?.role);
      if (role) { role.claimed = false; role.connected = false; }
    }
    if (route.request().url().includes("/demo-items/") && route.request().url().endsWith("/complete")) {
      const key = route.request().url().split("/demo-items/")[1]?.split("/")[0];
      const item = data.mockItems.find(value => value.key === key);
      if (item) item.status = "complete";
    }
    if (route.request().url().endsWith("/cases") && body?.preset) {
      const ordinal = data.cases.length + 1;
      const reference = `SIM-R1-C${String(ordinal).padStart(2, "0")}`;
      data.cases.push({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(ordinal).padStart(12, "0")}`, ordinal, reference,
        amount: body.preset === "5m" ? "500000000" : body.preset === "25m" ? "2500000000" : "1000000000",
        status: "opened", nextRole: "fund", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    if (route.request().url().includes("/cases/") && route.request().url().endsWith("/actions")) {
      const id = route.request().url().split("/cases/")[1]?.split("/")[0];
      const item = data.cases.find(value => value.id === id);
      if (item && body?.action === "fund_review") { item.status = "fund_reviewed"; item.nextRole = "bank"; }
      if (item && body?.action === "bank_acknowledge") { item.status = "bank_acknowledged"; item.nextRole = null; }
    }
    if (body?.action === "confirm_proceeds") {
      data.state.step = 4; data.state.balances.cash = "45000000000"; data.state.balances.pending = "0";
      data.next = { type: "approve_payouts", role: "issuer", label: "Approve $450m payouts", result: "Issuer approved payouts." };
    }
    data.revision++;
    return route.fulfill({ json: { ok: true, runId: RUN_ID, revision: data.revision } });
  });
  await page.route(`**/api/rooms/${CODE}/state**`, route => route.fulfill({ json: data }));
  await page.route(`**/api/rooms/${CODE}/preview`, route => route.fulfill({ json: { code: CODE, runId: RUN_ID, status: data.status, roles: data.roles.map(r => ({ role: r.role, claimed: r.claimed })) } }));
  await page.route(`**/api/rooms/${CODE}/runs/${RUN_ID}`, route => route.fulfill({ json: { runId: RUN_ID, runNumber: 1, opening: { ...balances, cash: "30000000000", fund: "170000000000", pending: "0" }, closing: balances, events: data.events } }));
}
