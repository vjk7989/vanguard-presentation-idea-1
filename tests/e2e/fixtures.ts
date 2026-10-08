import type { Page } from "@playwright/test";
import type { Snapshot, WireEvent } from "../../src/lib/store";
import type { Role } from "../../src/lib/domain";
import { MOCK_FIXTURES, MOCK_INITIAL_STATUS } from "../../src/lib/mock-queue";

export const CODE = "DEMO01";
export const RUN_ID = "11111111-1111-4111-8111-111111111111";
const balances = { cash: "30000000000", fund: "150000000000", pending: "20000000000", obligations: "200000000000", requiredBuffer: "5000000000", plannedPayout: "45000000000", redemption: "20000000000" };
const event = (index: number, type: string, label: string, actor: string): WireEvent => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, index, type, actor, onBehalfOf: null, label,
  amount: "20000000000", reference: `DEMO-ISS-DEMO01-${index}`, previousHash: "0".repeat(64), hash: String(index).repeat(64),
  stateAfter: { step: index, balances }, createdAt: `2026-10-09T00:0${index}:00.000Z` });

export function snapshot(kind: "presenter" | "participant", role: Role | null, status: Snapshot["status"] = "active"): Snapshot {
  const lobby = status === "lobby";
  return { code: CODE, runId: RUN_ID, runNumber: 1, revision: 3, status, mode: "conventional", scenario: "Friday customer redemptions",
    state: { step: lobby ? 0 : 3, balances: lobby ? { ...balances, fund: "170000000000", pending: "0" } : balances, payoutApproved: false, bankDelayed: false },
    next: lobby ? { type: "request_redemption", role: "issuer", label: "Request $200m fund cash", result: "Issuer requested $200m." } : { type: "confirm_proceeds", role: "bank", label: "Confirm incoming $200m", result: "Bank confirmed receipt." },
    roles: (["issuer", "fund", "bank"] as Role[]).map(r => ({ role: r, claimed: !lobby || r === "issuer", connected: !lobby || r === "issuer", walletId: `DEMO-${r.toUpperCase()}-${CODE}` })),
    presence: { online: 2, admins: kind === "presenter" ? 1 : 0, participants: kind === "presenter" ? 1 : 2, waiting: 0, assigned: kind === "presenter" ? 1 : 2,
      devices: kind === "presenter" ? [{ id: "22222222-2222-4222-8222-222222222222", label: "Device 222222", role: "issuer", connected: true }] : [] },
    mockItems: MOCK_FIXTURES.map(item => ({ ...item, status: MOCK_INITIAL_STATUS[item.key] })),
    session: { kind, role }, events: lobby ? [] : [event(1, "request_redemption", "Issuer requested $200m. Balances have not changed.", "issuer"), event(2, "accept_redemption", "Fund operator accepted the request. Bank cash remains $300m.", "fund"), event(3, "process_redemption", "Fund holdings fell to $1.5bn. $200m proceeds are pending.", "fund")],
    runs: [{ id: RUN_ID, runNumber: 1, createdAt: "2026-10-09T00:00:00.000Z", endedAt: null }], serverTime: "2026-10-09T00:04:00.000Z" };
}

export async function mockRoom(page: Page, data: Snapshot) {
  await page.route(`**/api/rooms/${CODE}/**`, route => {
    const body = route.request().postDataJSON() as { control?: string; mode?: Snapshot["mode"]; role?: Role; action?: string; sessionId?: string } | null;
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
    if (body?.action === "confirm_proceeds") {
      data.state.step = 4; data.state.balances.cash = "50000000000"; data.state.balances.pending = "0";
      data.next = { type: "approve_payouts", role: "issuer", label: "Approve $450m payouts", result: "Issuer approved payouts." };
    }
    data.revision++;
    return route.fulfill({ json: { ok: true, runId: RUN_ID, revision: data.revision } });
  });
  await page.route(`**/api/rooms/${CODE}/state`, route => route.fulfill({ json: data }));
  await page.route(`**/api/rooms/${CODE}/preview`, route => route.fulfill({ json: { code: CODE, runId: RUN_ID, status: data.status, roles: data.roles.map(r => ({ role: r.role, claimed: r.claimed })) } }));
  await page.route(`**/api/rooms/${CODE}/runs/${RUN_ID}`, route => route.fulfill({ json: { runId: RUN_ID, runNumber: 1, opening: { ...balances, cash: "30000000000", fund: "170000000000", pending: "0" }, closing: balances, events: data.events } }));
}
