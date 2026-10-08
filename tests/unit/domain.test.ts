import { describe, expect, it } from "vitest";
import { ACTIONS, actionsForVersion, applyAction, formatMoney, initialState, parseBalances, serializeBalances, type ScenarioState } from "../../src/lib/domain";
import { advanceCase, CASE_PRESETS, nextCaseRole } from "../../src/lib/demo-cases";
import { hashEvent } from "../../src/lib/ledger";
import { formatMockAmount, MOCK_FIXTURES, MOCK_INITIAL_STATUS } from "../../src/lib/mock-queue";

function atStep(step: number): ScenarioState {
  return ACTIONS.slice(0, step).reduce((state, action) => applyAction(state, action.type, action.role), initialState());
}

describe("Friday redemption", () => {
  it("produces the exact six-step balances without counting pending as cash", () => {
    const opening = initialState();
    const requested = atStep(1);
    const accepted = atStep(2);
    const processed = atStep(3);
    const received = atStep(4);
    const approved = atStep(5);
    const closed = atStep(6);
    expect(requested.balances).toEqual(opening.balances);
    expect(accepted.balances).toEqual(opening.balances);
    expect(processed.balances.cash).toBe(30_000_000_000n);
    expect(processed.balances.fund).toBe(155_000_000_000n);
    expect(processed.balances.pending).toBe(15_000_000_000n);
    expect(received.balances.cash).toBe(45_000_000_000n);
    expect(received.balances.pending).toBe(0n);
    expect(approved.balances.cash).toBe(received.balances.cash);
    expect(closed.balances.cash).toBe(0n);
    expect(closed.balances.obligations).toBe(155_000_000_000n);
    expect(closed.balances.fund + closed.balances.cash).toBe(closed.balances.obligations);
  });
  it("blocks wrong roles, skipped steps and repeated financial actions", () => {
    expect(() => applyAction(initialState(), "request_redemption", "fund")).toThrow("role");
    expect(() => applyAction(initialState(), "confirm_proceeds", "bank")).toThrow("next step");
    expect(() => applyAction(atStep(4), "confirm_proceeds", "bank")).toThrow("next step");
  });
  it("keeps delayed proceeds pending and requires the full $450m payout", () => {
    const delayed = { ...atStep(3), bankDelayed: true };
    expect(() => applyAction(delayed, "confirm_proceeds", "bank")).toThrow("delayed");
    expect(delayed.balances.cash).toBe(30_000_000_000n);
    expect(() => applyAction({ ...atStep(4), balances: { ...atStep(4).balances, cash: 44_999_999_999n } }, "approve_payouts", "issuer")).toThrow("$450m");
  });
  it("round trips integer minor units and formats display values", () => {
    const balances = atStep(6).balances;
    expect(parseBalances(serializeBalances(balances))).toEqual(balances);
    expect(formatMoney(balances.fund)).toBe("$1.55bn");
    expect(formatMoney(balances.cash)).toBe("$0m");
  });
  it("preserves the original $200m and $50m-buffer figures for version-one replay", () => {
    const legacy = actionsForVersion(1).reduce((state, action) => applyAction(state, action.type, action.role), initialState(1));
    expect(legacy.version).toBe(1);
    expect(legacy.balances.fund).toBe(150_000_000_000n);
    expect(legacy.balances.cash).toBe(5_000_000_000n);
    expect(legacy.balances.requiredBuffer).toBe(5_000_000_000n);
    expect(() => applyAction({ ...initialState(1), step: 4, balances: { ...initialState(1).balances, cash: 49_999_999_999n } }, "approve_payouts", "issuer")).toThrow("$500m");
  });
});

describe("repeatable practice coordination", () => {
  it("requires issuer opening, fund review, then bank acknowledgement", () => {
    expect(nextCaseRole("opened")).toBe("fund");
    expect(advanceCase("opened", "fund_review", "fund")).toBe("fund_reviewed");
    expect(advanceCase("fund_reviewed", "bank_acknowledge", "bank")).toBe("bank_acknowledged");
    expect(nextCaseRole("bank_acknowledged")).toBeNull();
    expect(() => advanceCase("opened", "bank_acknowledge", "bank")).toThrow("Another team");
    expect(() => advanceCase("bank_acknowledged", "bank_acknowledge", "bank")).toThrow("already complete");
    expect(Object.values(CASE_PRESETS).every(value => /^\d+$/.test(value))).toBe(true);
  });
});

describe("linked simulated events", () => {
  it("links every event to the previous hash and detects a changed payload", () => {
    const base = { runId: "run-1", index: 1, type: "request_redemption", actor: "issuer", onBehalfOf: null, label: "Requested", amount: "20000000000", reference: "DEMO-ISS-1", previousHash: "0".repeat(64), stateAfter: { step: 1 }, createdAt: "2026-10-09T00:00:00.000Z" };
    const first = hashEvent(base);
    const second = hashEvent({ ...base, index: 2, type: "accept_redemption", actor: "fund", label: "Accepted", previousHash: first });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(hashEvent({ ...base, label: "Changed" })).not.toBe(first);
    expect(hashEvent({ ...base, onBehalfOf: "fund" })).not.toBe(first);
  });
});

describe("fictional background work", () => {
  it("has unique role-owned minor-unit items and an independent starting status", () => {
    expect(new Set(MOCK_FIXTURES.map(item => item.key)).size).toBe(MOCK_FIXTURES.length);
    expect(MOCK_FIXTURES.filter(item => item.role === "issuer")).toHaveLength(3);
    expect(MOCK_FIXTURES.filter(item => item.role === "fund")).toHaveLength(3);
    expect(MOCK_FIXTURES.filter(item => item.role === "bank")).toHaveLength(3);
    expect(MOCK_FIXTURES.every(item => /^\d+$/.test(item.amount) && BigInt(item.amount) > 0n)).toBe(true);
    expect(MOCK_FIXTURES.filter(item => MOCK_INITIAL_STATUS[item.key] === "pending")).toHaveLength(6);
    expect(initialState().balances.cash).toBe(30_000_000_000n);
    expect(formatMockAmount("235000000")).toBe("$2,350,000");
    expect(formatMockAmount("112500000")).toBe("$1,125,000");
    expect(formatMockAmount("12345")).toBe("$123.45");
  });
});
