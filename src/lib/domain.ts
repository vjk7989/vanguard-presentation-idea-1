export const ROLES = ["issuer", "fund", "bank"] as const;
export type Role = (typeof ROLES)[number] | "portfolio" | "lending" | "broker_a" | "broker_b" | "custody"
  | "hedge" | "dealer" | "paying_bank" | "accounting" | "pension" | "tax_compliance" | "depositary";
export type Mode = "conventional" | "ledger";
export type RoomStatus = "lobby" | "active" | "paused" | "ended";
export type ScenarioVersion = 1 | 2;
export type ActionType =
  | "request_redemption"
  | "accept_redemption"
  | "process_redemption"
  | "confirm_proceeds"
  | "approve_payouts"
  | "confirm_payouts";
export type ControlType =
  | "start" | "pause" | "resume" | "reset" | "end"
  | "set_mode" | "delay_bank" | "release_bank" | "repeat_bank" | "switch_idea";
export type ActionDefinition = { type: ActionType; role: Role; label: string; result: string };

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
  version: ScenarioVersion;
  step: number;
  balances: Balances;
  payoutApproved: boolean;
  bankDelayed: boolean;
}

const MILLION = 100_000_000n;
export const LEGACY_OPENING_BALANCES: Balances = {
  cash: 300n * MILLION,
  fund: 1_700n * MILLION,
  pending: 0n,
  obligations: 2_000n * MILLION,
  requiredBuffer: 50n * MILLION,
  plannedPayout: 450n * MILLION,
  redemption: 200n * MILLION,
};
export const OPENING_BALANCES: Balances = {
  ...LEGACY_OPENING_BALANCES,
  requiredBuffer: 0n,
  redemption: 150n * MILLION,
};
export function openingBalances(version: ScenarioVersion): Balances {
  return version === 1 ? { ...LEGACY_OPENING_BALANCES } : { ...OPENING_BALANCES };
}

export function actionsForVersion(version: ScenarioVersion): readonly ActionDefinition[] {
  const redemption = version === 1 ? "$200m" : "$150m";
  const fundAfter = version === 1 ? "$1.5bn" : "$1.55bn";
  const cashAfter = version === 1 ? "$500m" : "$450m";
  const closingCash = version === 1 ? "$50m" : "$0m";
  return [
    { type: "request_redemption", role: "issuer", label: `Request ${redemption} fund cash`, result: `Issuer requested ${redemption}. Balances have not changed.` },
    { type: "accept_redemption", role: "fund", label: "Accept fund request", result: "Fund operator accepted the request. Bank cash remains $300m." },
    { type: "process_redemption", role: "fund", label: `Process ${redemption} redemption`, result: `Fund holdings fell to ${fundAfter}. ${redemption} proceeds are pending.` },
    { type: "confirm_proceeds", role: "bank", label: `Confirm incoming ${redemption}`, result: `Bank confirmed receipt. Available cash is ${cashAfter}.` },
    { type: "approve_payouts", role: "issuer", label: "Approve $450m payouts", result: "Issuer approved payouts. Available cash is unchanged." },
    { type: "confirm_payouts", role: "bank", label: "Confirm completed payouts", result: `Bank confirmed payouts. Cash is ${closingCash} and obligations are $1.55bn.` },
  ] as const satisfies readonly ActionDefinition[];
}
export const ACTIONS = actionsForVersion(2);

export function initialState(version: ScenarioVersion = 2): ScenarioState {
  return { version, step: 0, balances: openingBalances(version), payoutApproved: false, bankDelayed: false };
}

export function nextAction(step: number, version: ScenarioVersion = 2) {
  return actionsForVersion(version)[step] ?? null;
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
  const expected = nextAction(state.step, state.version);
  if (!expected || expected.type !== action) throw new DomainError("WRONG_STEP", "This action is not the next step.");
  if (expected.role !== role) throw new DomainError("WRONG_ROLE", "This role cannot perform the current action.", 403);
  if (action === "confirm_proceeds" && state.bankDelayed) throw new DomainError("BANK_DELAYED", "Bank confirmation is delayed. Pending proceeds are not available cash.");
  const b = { ...state.balances };
  let payoutApproved = state.payoutApproved;
  if (action === "process_redemption") { b.fund -= b.redemption; b.pending += b.redemption; }
  if (action === "confirm_proceeds") { b.pending -= b.redemption; b.cash += b.redemption; }
  if (action === "approve_payouts") {
    if (b.cash < b.plannedPayout + b.requiredBuffer) throw new DomainError("INSUFFICIENT_CASH", `Payouts need ${formatMoney(b.plannedPayout + b.requiredBuffer)} confirmed bank cash${b.requiredBuffer ? `, including the ${formatMoney(b.requiredBuffer)} buffer` : ""}.`);
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

export function fromWireState(value: { version?: ScenarioVersion; step: number; balances: SerializedBalances; payoutApproved: boolean; bankDelayed: boolean }): ScenarioState {
  return { ...value, version: value.version ?? 1, balances: parseBalances(value.balances) };
}
