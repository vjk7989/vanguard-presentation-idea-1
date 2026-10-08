import { describe, expect, it } from "vitest";
import { ACTIONS, applyAction, formatMoney, initialState, parseBalances, serializeBalances, type ScenarioState } from "../../src/lib/domain";
import { hashEvent } from "../../src/lib/ledger";

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
    expect(processed.balances.fund).toBe(150_000_000_000n);
    expect(processed.balances.pending).toBe(20_000_000_000n);
    expect(received.balances.cash).toBe(50_000_000_000n);
    expect(received.balances.pending).toBe(0n);
    expect(approved.balances.cash).toBe(received.balances.cash);
    expect(closed.balances.cash).toBe(5_000_000_000n);
    expect(closed.balances.obligations).toBe(155_000_000_000n);
    expect(closed.balances.fund + closed.balances.cash).toBe(closed.balances.obligations);
  });
  it("blocks wrong roles, skipped steps and repeated financial actions", () => {
    expect(() => applyAction(initialState(), "request_redemption", "fund")).toThrow("role");
    expect(() => applyAction(initialState(), "confirm_proceeds", "bank")).toThrow("next step");
    expect(() => applyAction(atStep(4), "confirm_proceeds", "bank")).toThrow("next step");
  });
  it("keeps delayed proceeds pending and payout approval behind the cash buffer", () => {
    const delayed = { ...atStep(3), bankDelayed: true };
    expect(() => applyAction(delayed, "confirm_proceeds", "bank")).toThrow("delayed");
    expect(delayed.balances.cash).toBe(30_000_000_000n);
    expect(() => applyAction({ ...atStep(4), balances: { ...atStep(4).balances, cash: 49_999_999_999n } }, "approve_payouts", "issuer")).toThrow("$500m");
  });
  it("round trips integer minor units and formats display values", () => {
    const balances = atStep(6).balances;
    expect(parseBalances(serializeBalances(balances))).toEqual(balances);
    expect(formatMoney(balances.fund)).toBe("$1.5bn");
    expect(formatMoney(balances.cash)).toBe("$50m");
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
