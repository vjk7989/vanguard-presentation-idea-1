export const ROLES = ["issuer", "fund", "bank"] as const;
export type Role = (typeof ROLES)[number];
export type Mode = "conventional" | "ledger";
export type RoomStatus = "lobby" | "active" | "paused" | "ended";
export type ActionType =
  | "request_redemption"
  | "accept_redemption"
  | "process_redemption"
  | "confirm_proceeds"
  | "approve_payouts"
  | "confirm_payouts";
export type ControlType =
  | "start" | "pause" | "resume" | "reset" | "end"
  | "set_mode" | "delay_bank" | "release_bank" | "repeat_bank";

export type MoneyString = string;
export interface Balances {
  cash: bigint;
  fund: bigint;
  pending: bigint;
  obligations: bigint;
  requiredBuffer: bigint;
  plannedPayout: bigint;
  redemption: bigint;
}
export interface SerializedBalances {
  cash: MoneyString;
  fund: MoneyString;
  pending: MoneyString;
  obligations: MoneyString;
  requiredBuffer: MoneyString;
  plannedPayout: MoneyString;
  redemption: MoneyString;
}
export interface ScenarioState {
  step: number;
  balances: Balances;
  payoutApproved: boolean;
  bankDelayed: boolean;
}

const MILLION = 100_000_000n;
export const OPENING_BALANCES: Balances = {
  cash: 300n * MILLION,
  fund: 1_700n * MILLION,
  pending: 0n,
  obligations: 2_000n * MILLION,
  requiredBuffer: 50n * MILLION,
  plannedPayout: 450n * MILLION,
  redemption: 200n * MILLION,
};
export const ACTIONS: readonly { type: ActionType; role: Role; label: string; result: string }[] = [
  { type: "request_redemption", role: "issuer", label: "Request $200m fund cash", result: "Issuer requested $200m. Balances have not changed." },
  { type: "accept_redemption", role: "fund", label: "Accept fund request", result: "Fund operator accepted the request. Bank cash remains $300m." },
  { type: "process_redemption", role: "fund", label: "Process $200m redemption", result: "Fund holdings fell to $1.5bn. $200m proceeds are pending." },
  { type: "confirm_proceeds", role: "bank", label: "Confirm incoming $200m", result: "Bank confirmed receipt. Available cash is $500m." },
  { type: "approve_payouts", role: "issuer", label: "Approve $450m payouts", result: "Issuer approved payouts. Available cash is unchanged." },
  { type: "confirm_payouts", role: "bank", label: "Confirm completed payouts", result: "Bank confirmed payouts. Cash is $50m and obligations are $1.55bn." },
];

export function initialState(): ScenarioState {
  return { step: 0, balances: { ...OPENING_BALANCES }, payoutApproved: false, bankDelayed: false };
}

export function nextAction(step: number) {
  return ACTIONS[step] ?? null;
}

export function serializeBalances(b: Balances): SerializedBalances {
  return Object.fromEntries(Object.entries(b).map(([key, value]) => [key, value.toString()])) as unknown as SerializedBalances;
}

export function parseBalances(b: SerializedBalances): Balances {
  return Object.fromEntries(Object.entries(b).map(([key, value]) => [key, BigInt(value)])) as unknown as Balances;
}

export function formatMoney(value: bigint | string): string {
  const cents = typeof value === "string" ? BigInt(value) : value;
  const abs = cents < 0n ? -cents : cents;
  const dollars = Number(abs) / 100;
  const sign = cents < 0n ? "−" : "";
  if (dollars >= 1_000_000_000) return `${sign}$${(dollars / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}bn`;
  return `${sign}$${(dollars / 1_000_000).toFixed(dollars % 1_000_000 === 0 ? 0 : 1)}m`;
}

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export function applyAction(state: ScenarioState, action: ActionType, role: Role): ScenarioState {
  const expected = nextAction(state.step);
  if (!expected || expected.type !== action) throw new DomainError("WRONG_STEP", "This action is not the next step.");
  if (expected.role !== role) throw new DomainError("WRONG_ROLE", "This role cannot perform the current action.", 403);
  if (action === "confirm_proceeds" && state.bankDelayed) throw new DomainError("BANK_DELAYED", "Bank confirmation is delayed. Pending proceeds are not available cash.");
  const b = { ...state.balances };
  let payoutApproved = state.payoutApproved;
  if (action === "process_redemption") { b.fund -= b.redemption; b.pending += b.redemption; }
  if (action === "confirm_proceeds") { b.pending -= b.redemption; b.cash += b.redemption; }
  if (action === "approve_payouts") {
    if (b.cash < b.plannedPayout + b.requiredBuffer) throw new DomainError("INSUFFICIENT_CASH", "Payouts need $500m available cash, including the $50m buffer.");
    payoutApproved = true;
  }
  if (action === "confirm_payouts") {
    if (!payoutApproved) throw new DomainError("NOT_APPROVED", "The issuer must approve payouts first.");
    b.cash -= b.plannedPayout;
    b.obligations -= b.plannedPayout;
  }
  if (b.cash < 0n || b.fund < 0n || b.pending < 0n || b.obligations < 0n) throw new DomainError("NEGATIVE_BALANCE", "The action would make a balance negative.");
  return { ...state, step: state.step + 1, balances: b, payoutApproved };
}

export function toWireState(state: ScenarioState) {
  return { ...state, balances: serializeBalances(state.balances) };
}

export function fromWireState(value: { step: number; balances: SerializedBalances; payoutApproved: boolean; bankDelayed: boolean }): ScenarioState {
  return { ...value, balances: parseBalances(value.balances) };
}
