import { describe, expect, it } from "vitest";
import { idea2 } from "../../src/lib/ideas/idea2";
import { idea3 } from "../../src/lib/ideas/idea3";
import { idea4 } from "../../src/lib/ideas/idea4";
import type { IdeaSpec } from "../../src/lib/ideas/types";

function run(spec: IdeaSpec, ids: string[]) {
  return ids.reduce((state, id) => spec.transition(state, id).state, spec.initialState());
}

describe("all three new pitch workflows", () => {
  it("starts each reset from independent deterministic state and stable role fixtures", () => {
    for (const spec of [idea2, idea3, idea4]) {
      const first = spec.initialState();
      const fresh = spec.initialState();
      expect(fresh).toEqual(first);
      expect(fresh).not.toBe(first);
      expect(spec.roles.length).toBeGreaterThanOrEqual(3);
      for (const role of spec.roles) {
        expect(role.sampleRecords.length).toBeGreaterThanOrEqual(4);
        expect(role.sampleRecords.length).toBeLessThanOrEqual(6);
        expect(new Set(role.sampleRecords.map((item) => item.reference)).size).toBe(role.sampleRecords.length);
      }
      const openingAction = spec.actions(first)[0];
      expect(openingAction?.role).toBeTruthy();
      const diagramNodes = new Set([...spec.roles.map((role) => role.id), "simulated_authority"]);
      expect(spec.actions(first).every((action) =>
        (diagramNodes.has(action.role) || action.role === "presenter") &&
        diagramNodes.has(action.source) && diagramNodes.has(action.target))).toBe(true);
      const acted = spec.transition(first, openingAction.id);
      expect(acted.state).not.toBe(first);
      expect(spec.initialState()).toEqual(fresh);
      expect(() => spec.transition(first, "unlisted_or_out_of_order")).toThrow();
    }
  });

  it("keeps broker notices separate from custody-confirmed shares and completes only at 400,000", () => {
    const opening = idea2.initialState();
    expect(opening.deliverableShares).toBe(150_000);
    expect(opening.shortfallShares).toBe(250_000);
    expect(() => idea2.transition(opening, "broker_a_return")).toThrow();

    const noticed = run(idea2, ["place_sale_order", "recall_broker_a", "recall_broker_b", "broker_a_return", "broker_b_return"]);
    expect(noticed.custodyConfirmedShares).toBe(0);
    expect(noticed.deliverableShares).toBe(150_000);
    expect(() => idea2.transition(noticed, "confirm_delivery")).toThrow();

    const oneReceived = idea2.transition(noticed, "custody_confirm_a").state;
    expect(oneReceived.custodyConfirmedShares).toBe(150_000);
    expect(oneReceived.deliverableShares).toBe(300_000);
    expect(oneReceived.shortfallShares).toBe(100_000);
    const allReceived = idea2.transition(oneReceived, "custody_confirm_b");
    expect(allReceived.state.deliverableShares).toBe(400_000);
    expect(allReceived.state.shortfallShares).toBe(0);
    expect(allReceived.pathKind).toBe("confirmed");
    expect(idea2.transition(allReceived.state, "confirm_delivery").state.delivered).toBe(true);
    expect(idea2.actions(idea2.transition(allReceived.state, "confirm_delivery").state)).toEqual([]);
    expect(opening.deliverableShares).toBe(150_000);
  });

  it("shows a late Broker B return as a shortfall until custody confirms receipt", () => {
    const delayed = run(idea2, ["place_sale_order", "recall_broker_a", "recall_broker_b", "broker_a_return", "custody_confirm_a", "broker_b_delay"]);
    expect(delayed.brokerBDelayed).toBe(true);
    expect(delayed.shortfallShares).toBe(100_000);
    const reported = idea2.transition(delayed, "assess_shortfall");
    expect(reported.state.stage).toBe("t_plus_one_failed");
    expect(reported.pathKind).toBe("evidence");
    expect(() => idea2.transition(reported.state, "confirm_delivery")).toThrow();
    const lateNotice = idea2.transition(reported.state, "broker_b_return").state;
    expect(lateNotice.shortfallShares).toBe(100_000);
    expect(idea2.transition(lateNotice, "custody_confirm_b").state.shortfallShares).toBe(0);
  });

  it("holds hedge margin as pending until the paying bank confirms and accounting books", () => {
    const opening = idea3.initialState();
    expect(opening.notionalEur).toBe("400000000");
    expect(opening.fundMarginUsd).toBe("1800000");
    expect(opening.dealerMarginUsd).toBe("1830000");
    expect(() => idea3.transition(opening, "book_confirmed_payment")).toThrow();

    const call = run(idea3, ["capture_snapshot", "submit_fund_valuation", "raise_valuation_dispute", "agree_margin", "issue_margin_call"]);
    expect(call.agreedMarginUsd).toBe("1800000");
    expect(call.paymentStatus).toBe("pending");
    expect(call.accountingStatus).toBe("unbooked");
    expect(() => idea3.transition(call, "book_confirmed_payment")).toThrow();
    const confirmed = idea3.transition(call, "confirm_margin_payment");
    expect(confirmed.pathKind).toBe("confirmed");
    expect(confirmed.state.paymentStatus).toBe("confirmed");
    expect(confirmed.state.accountingStatus).toBe("unbooked");
    const booked = idea3.transition(confirmed.state, "book_confirmed_payment").state;
    expect(booked.accountingStatus).toBe("booked");
    expect(idea3.actions(booked)).toEqual([]);
  });

  it("requires renewed tax proof after expiry and never treats claim submission as relief", () => {
    const direct = run(idea4, ["request_residence_proof", "issue_valid_proof", "verify_residence_proof", "submit_relief_claim"]);
    expect(direct.claimStatus).toBe("pending");
    const completed = idea4.transition(direct, "confirm_simulated_relief").state;
    expect(completed.claimStatus).toBe("simulated_confirmed");
    expect(idea4.actions(completed)).toEqual([]);

    const expired = run(idea4, ["request_residence_proof", "issue_expired_proof", "flag_expired_proof"]);
    expect(expired.certificateStatus).toBe("expired");
    expect(() => idea4.transition(expired, "submit_relief_claim")).toThrow();
    const verified = run(idea4, ["request_residence_proof", "issue_expired_proof", "flag_expired_proof", "request_renewal", "issue_renewed_proof", "verify_renewed_proof"]);
    expect(verified.certificateStatus).toBe("verified");
    const submitted = idea4.transition(verified, "submit_relief_claim");
    expect(submitted.state.claimStatus).toBe("pending");
    expect(submitted.pathKind).toBe("instruction");
    expect(idea4.actions(submitted.state).map((item) => item.role)).toEqual(["presenter"]);
  });
});
