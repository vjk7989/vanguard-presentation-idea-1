import { DomainError, type MoneyString, type Role } from "./domain";

export const CASE_PRESETS = {
  "5m": "500000000",
  "10m": "1000000000",
  "25m": "2500000000",
} as const satisfies Record<string, MoneyString>;
export type CasePreset = keyof typeof CASE_PRESETS;
export type CaseStatus = "opened" | "fund_reviewed" | "bank_acknowledged";
export type CaseAction = "fund_review" | "bank_acknowledge";

export type DemoCase = {
  id: string;
  ordinal: number;
  reference: string;
  amount: MoneyString;
  status: CaseStatus;
  nextRole: Role | null;
  createdAt: string;
  updatedAt: string;
};

export function nextCaseRole(status: CaseStatus): Role | null {
  return status === "opened" ? "fund" : status === "fund_reviewed" ? "bank" : null;
}

export function advanceCase(status: CaseStatus, action: CaseAction, role: Role): CaseStatus {
  if (status === "opened" && action === "fund_review" && role === "fund") return "fund_reviewed";
  if (status === "fund_reviewed" && action === "bank_acknowledge" && role === "bank") return "bank_acknowledged";
  if (status === "bank_acknowledged") throw new DomainError("CASE_COMPLETE", "This practice case is already complete.");
  if (nextCaseRole(status) !== role) throw new DomainError("WRONG_ROLE", "Another team owns the next practice step.", 403);
  throw new DomainError("WRONG_CASE_STEP", "This action is not the next practice step.");
}
