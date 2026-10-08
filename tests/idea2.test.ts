import { describe, expect, it } from "vitest";
import { idea2 } from "../src/lib/ideas/idea2";

type State = Record<string, unknown>;
const step = (state: State, id: string): State => idea2.transition(state, id).state;
const available = (state: State) => idea2.actions(state).map(action => action.id);

function recalled(): State {
  let state = idea2.initialState();
  state = step(state, "place_sale_order");
  state = step(state, "recall_broker_a");
  return step(state, "recall_broker_b");
}

describe("Idea 2 securities recall", () => {
  it("starts with 150,000 free shares and a 250,000-share recall need", () => {
    const state = idea2.initialState();
    expect(state.saleShares).toBe(400_000);
    expect(state.initiallyFreeShares).toBe(150_000);
    expect(state.onLoanShares).toBe(250_000);
    expect(state.deliverableShares).toBe(150_000);
    expect(state.shortfallShares).toBe(250_000);
    expect(available(state)).toEqual(["place_sale_order"]);
    expect(() => step(state, "broker_a_return")).toThrow("out of order");
  });

  it("keeps broker messages separate from actual custodian-confirmed positions", () => {
    let state = recalled();
    state = step(state, "broker_a_return");
    state = step(state, "broker_b_return");
    expect(state.custodyConfirmedShares).toBe(0);
    expect(state.deliverableShares).toBe(150_000);
    expect(state.shortfallShares).toBe(250_000);
    expect(available(state)).not.toContain("confirm_delivery");
    state = step(state, "custody_confirm_a");
    expect(state.custodyConfirmedShares).toBe(150_000);
    expect(state.deliverableShares).toBe(300_000);
    expect(state.shortfallShares).toBe(100_000);
    expect(available(state)).toContain("assess_shortfall");
    expect(() => step(state, "confirm_delivery")).toThrow("out of order");
    state = step(state, "custody_confirm_b");
    expect(state.custodyConfirmedShares).toBe(250_000);
    expect(state.deliverableShares).toBe(400_000);
    expect(state.shortfallShares).toBe(0);
    expect(available(state)).toContain("confirm_delivery");
    state = step(state, "confirm_delivery");
    expect(state.delivered).toBe(true);
    expect(state.stage).toBe("delivery_confirmed");
    expect(available(state)).toEqual([]);
  });

  it("shows an explicit late Broker B exception and a recoverable shortfall", () => {
    let state = recalled();
    state = step(state, "broker_b_delay");
    expect(state.brokerBDelayed).toBe(true);
    expect(state.tPlusOneFailed).toBe(true);
    expect(state.stage).toBe("t_plus_one_failed");
    expect(idea2.actions(state).find(action => action.id === "broker_b_return")?.label).toContain("late");
    state = step(state, "broker_a_return");
    state = step(state, "custody_confirm_a");
    state = step(state, "assess_shortfall");
    expect(state.stage).toBe("t_plus_one_failed");
    expect(state.shortfallShares).toBe(100_000);
    expect(() => step(state, "confirm_delivery")).toThrow("out of order");
    expect(() => step(state, "assess_shortfall")).toThrow("out of order");
    state = step(state, "broker_b_return");
    expect(state.shortfallShares).toBe(100_000);
    state = step(state, "custody_confirm_b");
    expect(state.shortfallShares).toBe(0);
    expect(state.stage).toBe("late_delivery_ready");
    expect(idea2.actions(state).find(action => action.id === "confirm_delivery")?.label).toContain("late");
    const recovered = step(state, "confirm_delivery");
    expect(recovered.delivered).toBe(true);
    expect(recovered.tPlusOneFailed).toBe(true);
    expect(recovered.stage).toBe("late_recovery_recorded");
  });

  it("returns deterministic live-event metadata without mutating prior snapshots", () => {
    const opening = idea2.initialState();
    const event = idea2.transition(opening, "place_sale_order");
    expect(event).toMatchObject({ source: "portfolio", target: "lending", pathKind: "instruction", reference: "EQ-RECALL-0400" });
    expect(opening.orderPlaced).toBe(false);
    expect(event.state.orderPlaced).toBe(true);
    expect(idea2.transition(recalled(), "broker_a_return")).toMatchObject({ source: "broker_a", target: "custody", pathKind: "evidence" });
  });

  it("provides distinct professional desks with four stable sample records each", () => {
    expect(idea2.roles.map(role => role.id)).toEqual(["portfolio", "lending", "broker_a", "broker_b", "custody"]);
    for (const role of idea2.roles) {
      expect(role.title.length).toBeGreaterThan(5);
      expect(role.sampleRecords).toHaveLength(4);
      expect(new Set(role.sampleRecords.map(record => record.reference)).size).toBe(4);
      expect(role.sampleRecords.every(record => record.status.startsWith("Sample"))).toBe(true);
    }
  });
});
