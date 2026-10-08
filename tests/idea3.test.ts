import { describe, expect, it } from "vitest";
import { idea3 } from "../src/lib/ideas/idea3";

const STEP_IDS = [
  "capture_snapshot",
  "submit_fund_valuation",
  "raise_valuation_dispute",
  "agree_margin",
  "issue_margin_call",
  "confirm_margin_payment",
  "book_confirmed_payment",
];

describe("Idea 3 currency hedge", () => {
  it("walks the fund, dealer, paying bank, and accounting desks in order", () => {
    let state = idea3.initialState();
    const paths: string[] = [];
    for (const id of STEP_IDS) {
      expect(idea3.actions(state).map(action => action.id)).toEqual([id]);
      const result = idea3.transition(state, id);
      paths.push(`${result.source}->${result.target}`);
      state = result.state;
    }
    expect(paths).toEqual([
      "hedge->dealer",
      "hedge->dealer",
      "dealer->hedge",
      "hedge->dealer",
      "dealer->paying_bank",
      "paying_bank->accounting",
      "accounting->hedge",
    ]);
    expect(idea3.actions(state)).toEqual([]);
    expect(state).toMatchObject({ stage: "booked", paymentStatus: "confirmed", accountingStatus: "booked" });
  });

  it("does not call a margin instruction paid or book it before bank confirmation", () => {
    let state = idea3.initialState();
    for (const id of STEP_IDS.slice(0, 5)) state = idea3.transition(state, id).state;
    expect(state).toMatchObject({ stage: "call_issued", agreedMarginUsd: "1800000", paymentStatus: "pending", accountingStatus: "unbooked" });
    expect(() => idea3.transition(state, "book_confirmed_payment")).toThrow("next currency-hedge step");
    state = idea3.transition(state, "confirm_margin_payment").state;
    expect(state).toMatchObject({ paymentStatus: "confirmed", accountingStatus: "unbooked" });
    expect(idea3.transition(state, "book_confirmed_payment").state.accountingStatus).toBe("booked");
  });

  it("rejects skipped, repeated, unknown, and malformed actions without mutating input", () => {
    const opening = idea3.initialState();
    expect(() => idea3.transition(opening, "issue_margin_call")).toThrow("next currency-hedge step");
    expect(() => idea3.transition(opening, "not_real")).toThrow("Unknown currency-hedge action");
    const snapshot = idea3.transition(opening, "capture_snapshot").state;
    expect(opening.stage).toBe("awaiting_snapshot");
    expect(() => idea3.transition(snapshot, "capture_snapshot")).toThrow("next currency-hedge step");
    expect(() => idea3.actions({ stage: "booked" })).toThrow("Invalid currency-hedge state");
  });

  it("keeps display figures and sample work deterministic and distinct from live actions", () => {
    const opening = idea3.initialState();
    expect(opening).toMatchObject({ notionalEur: "400000000", fundMarginUsd: "1800000", dealerMarginUsd: "1830000", agreedMarginUsd: null });
    expect(idea3.roles.map(role => role.id)).toEqual(["hedge", "dealer", "paying_bank", "accounting"]);
    expect(idea3.roles.every(role => role.sampleRecords.length >= 4 && role.sampleRecords.length <= 6)).toBe(true);
    expect(idea3.roles.every(role => role.sampleRecords.some(record => record.reference === "FXH-400-001"))).toBe(true);
    expect(idea3.initialState()).toEqual(opening);
  });
});
