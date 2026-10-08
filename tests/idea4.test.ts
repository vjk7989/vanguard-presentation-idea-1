import { describe, expect, it } from "vitest";
import { idea4 } from "../src/lib/ideas/idea4";

function advance(actionIds: string[]) {
  return actionIds.reduce((state, actionId) => idea4.transition(state, actionId).state, idea4.initialState());
}

describe("Idea 4 synthetic tax proof", () => {
  it("keeps the claim pending until an explicit simulated authority decision", () => {
    const verified = advance(["request_residence_proof", "issue_valid_proof", "verify_residence_proof"]);
    expect(verified.certificateStatus).toBe("verified");
    expect(verified.claimStatus).toBe("not_submitted");
    const claim = idea4.transition(verified, "submit_relief_claim");
    expect(claim.state.claimStatus).toBe("pending");
    expect(claim.pathKind).toBe("instruction");
    expect(idea4.actions(claim.state)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "confirm_simulated_relief", role: "presenter" })]));
    expect(idea4.transition(claim.state, "confirm_simulated_relief").state.claimStatus).toBe("simulated_confirmed");
  });

  it("blocks expired proof and requires a renewal and fresh verification", () => {
    const expired = advance(["request_residence_proof", "issue_expired_proof"]);
    expect(expired.certificateStatus).toBe("expired");
    expect(expired.certificateExpiresOn).toBe("2026-09-09");
    expect(() => idea4.transition(expired, "submit_relief_claim")).toThrow("not available");
    expect(() => idea4.transition(expired, "verify_residence_proof")).toThrow("not available");
    const renewed = advance(["request_residence_proof", "issue_expired_proof", "flag_expired_proof", "request_renewal", "issue_renewed_proof", "verify_renewed_proof"]);
    expect(renewed.certificateReference).toContain("-R1");
    expect(renewed.certificateExpiresOn).toBe("2027-10-08");
    expect(renewed.certificateStatus).toBe("verified");
    expect(idea4.actions(renewed).map((action) => action.id)).toEqual(["submit_relief_claim"]);
  });

  it("enforces ordered steps without mutating earlier snapshots", () => {
    const opening = idea4.initialState();
    expect(() => idea4.transition(opening, "issue_valid_proof")).toThrow("not available");
    const requested = idea4.transition(opening, "request_residence_proof");
    expect(opening.stage).toBe("proof_needed");
    expect(requested.state.stage).toBe("proof_requested");
    expect(() => idea4.transition(requested.state, "request_residence_proof")).toThrow("not available");
    expect(idea4.actions(requested.state)).toEqual(expect.arrayContaining([expect.objectContaining({ role: "presenter" })]));
  });

  it("supplies five stable role-specific sample records without a tax-rate claim", () => {
    expect(idea4.roles.map((role) => role.id)).toEqual(["pension", "tax_compliance", "depositary"]);
    for (const role of idea4.roles) {
      expect(role.sampleRecords).toHaveLength(5);
      expect(new Set(role.sampleRecords.map((item) => item.reference)).size).toBe(5);
      expect(JSON.stringify(role.sampleRecords)).not.toMatch(/\b\d+(?:\.\d+)?%/);
    }
  });
});
