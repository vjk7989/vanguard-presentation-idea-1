import type { Role } from "./domain";

export type MockStatus = "pending" | "complete";
export type MockItem = {
  key: string;
  role: Role;
  title: string;
  counterparty: string;
  amount: string;
  reference: string;
  action: string;
  completedLabel: string;
  note: string;
  status: MockStatus;
};

/** Fictional, non-financial work items. Amounts are display-only minor units. */
export const MOCK_FIXTURES: readonly Omit<MockItem, "status">[] = [
  { key: "iss-pay-01", role: "issuer", title: "Operations vendor payout", counterparty: "North Quay Services", amount: "235000000", reference: "SIM-ISS-2401", action: "Approve payout", completedLabel: "Approved", note: "A routine vendor authorization. It does not affect the Friday reserve scenario." },
  { key: "iss-pay-02", role: "issuer", title: "Tax remittance review", counterparty: "Civic Revenue Office", amount: "112500000", reference: "SIM-ISS-2402", action: "Approve remittance", completedLabel: "Approved", note: "A fictional remittance used to show the treasury approval workflow." },
  { key: "iss-pay-03", role: "issuer", title: "Custody fee", counterparty: "Harbor Custody", amount: "42500000", reference: "SIM-ISS-2399", action: "View authorization", completedLabel: "Approved", note: "Previously approved in the simulated work queue." },
  { key: "fund-red-01", role: "fund", title: "Income fund redemption", counterparty: "Harborview Partners", amount: "2500000000", reference: "SIM-FUND-7811", action: "Process request", completedLabel: "Processed", note: "A separate fictional redemption batch, outside the Friday scenario." },
  { key: "fund-red-02", role: "fund", title: "Liquidity fund redemption", counterparty: "Riverside Advisors", amount: "1500000000", reference: "SIM-FUND-7812", action: "Process request", completedLabel: "Processed", note: "A separate fictional redemption batch, outside the Friday scenario." },
  { key: "fund-red-03", role: "fund", title: "Subscription allocation", counterparty: "Clearwater Management", amount: "800000000", reference: "SIM-FUND-7808", action: "View allocation", completedLabel: "Processed", note: "Previously processed in the simulated work queue." },
  { key: "bank-wire-01", role: "bank", title: "Incoming wire review", counterparty: "Harborview Partners", amount: "7500000000", reference: "SIM-BANK-5101", action: "Confirm wire", completedLabel: "Confirmed", note: "A fictional wire confirmation; it is not the $200m Friday proceeds." },
  { key: "bank-pay-02", role: "bank", title: "Payment file review", counterparty: "North Quay Services", amount: "235000000", reference: "SIM-BANK-5102", action: "Confirm payment", completedLabel: "Confirmed", note: "A fictional payment-file confirmation, separate from scenario cash." },
  { key: "bank-wire-03", role: "bank", title: "Custody transfer", counterparty: "Harbor Custody", amount: "1250000000", reference: "SIM-BANK-5098", action: "View confirmation", completedLabel: "Confirmed", note: "Previously confirmed in the simulated work queue." },
];

export const MOCK_INITIAL_STATUS: Record<string, MockStatus> = Object.fromEntries(
  MOCK_FIXTURES.map(item => [item.key, item.key.endsWith("03") ? "complete" : "pending"]),
);

export function fixtureByKey(key: string) { return MOCK_FIXTURES.find(item => item.key === key); }

export function formatMockAmount(minor: string): string {
  const amount = BigInt(minor);
  const absolute = amount < 0n ? -amount : amount;
  const cents = absolute % 100n;
  return `${amount < 0n ? "−" : ""}$${(absolute / 100n).toLocaleString("en-US")}${cents ? `.${cents.toString().padStart(2, "0")}` : ""}`;
}
