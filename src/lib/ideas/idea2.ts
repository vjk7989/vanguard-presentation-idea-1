import type { IdeaAction, IdeaSpec, IdeaTransition } from "./types";

const SALE_SHARES = 400_000;
const FREE_SHARES = 150_000;
const BROKER_A_SHARES = 150_000;
const BROKER_B_SHARES = 100_000;
const REFERENCE = "EQ-RECALL-0400";

type RecallState = Record<string, unknown> & {
  stage: string;
  saleShares: number;
  initiallyFreeShares: number;
  onLoanShares: number;
  custodyConfirmedShares: number;
  deliverableShares: number;
  shortfallShares: number;
  orderPlaced: boolean;
  recallA: boolean;
  recallB: boolean;
  noticeA: boolean;
  noticeB: boolean;
  confirmedA: boolean;
  confirmedB: boolean;
  brokerBDelayed: boolean;
  tPlusOneFailed: boolean;
  assessedShares: number;
  delivered: boolean;
};

function baseState(): RecallState {
  return {
    stage: "order_ready",
    saleShares: SALE_SHARES,
    initiallyFreeShares: FREE_SHARES,
    onLoanShares: BROKER_A_SHARES + BROKER_B_SHARES,
    custodyConfirmedShares: 0,
    deliverableShares: FREE_SHARES,
    shortfallShares: SALE_SHARES - FREE_SHARES,
    orderPlaced: false,
    recallA: false,
    recallB: false,
    noticeA: false,
    noticeB: false,
    confirmedA: false,
    confirmedB: false,
    brokerBDelayed: false,
    tPlusOneFailed: false,
    assessedShares: 0,
    delivered: false,
  };
}

function recallState(state: Record<string, unknown>): RecallState {
  return { ...baseState(), ...state } as RecallState;
}

function summarize(state: RecallState): RecallState {
  const custodyConfirmedShares = (state.confirmedA ? BROKER_A_SHARES : 0) + (state.confirmedB ? BROKER_B_SHARES : 0);
  const deliverableShares = FREE_SHARES + custodyConfirmedShares;
  const shortfallShares = Math.max(0, SALE_SHARES - deliverableShares);
  const stage = state.delivered ? state.tPlusOneFailed ? "late_recovery_recorded" : "delivery_confirmed"
    : shortfallShares === 0 ? state.tPlusOneFailed ? "late_delivery_ready" : "delivery_ready"
      : state.tPlusOneFailed ? "t_plus_one_failed"
      : state.assessedShares > 0 && state.assessedShares === custodyConfirmedShares ? "delivery_at_risk"
        : state.noticeA || state.noticeB ? "returns_pending_custody"
          : state.recallA || state.recallB ? "recall_in_flight"
            : state.orderPlaced ? "order_received" : "order_ready";
  return { ...state, stage, custodyConfirmedShares, deliverableShares, shortfallShares };
}

const action = (id: string, role: string, label: string, detail: string, target: string, pathKind: IdeaAction["pathKind"] = "instruction"): IdeaAction => ({
  id, role, label, detail, source: role, target, pathKind,
});

function availableActions(input: Record<string, unknown>): IdeaAction[] {
  const state = summarize(recallState(input));
  if (state.delivered) return [];
  if (!state.orderPlaced) return [action("place_sale_order", "portfolio", "Place 400,000-share sale", "Send the T+1 delivery requirement to the securities lending desk.", "lending")];
  const result: IdeaAction[] = [];
  if (!state.recallA) result.push(action("recall_broker_a", "lending", "Recall 150,000 shares · Broker A", "Recall the first active loan for the T+1 sale.", "broker_a"));
  if (!state.recallB) result.push(action("recall_broker_b", "lending", "Recall 100,000 shares · Broker B", "Recall the second active loan for the T+1 sale.", "broker_b"));
  if (state.recallA && !state.noticeA) result.push(action("broker_a_return", "broker_a", "Notify 150,000-share return", "Send a return notice; custody must still verify receipt.", "custody", "evidence"));
  if (state.recallB && !state.noticeB) {
    result.push(action("broker_b_return", "broker_b", state.brokerBDelayed ? "Notify late 100,000-share return" : "Notify 100,000-share return", "Send a return notice; custody must still verify receipt.", "custody", "evidence"));
    if (!state.brokerBDelayed) result.push(action("broker_b_delay", "broker_b", "Report 100,000 shares one day late", "Tell lending the shares have missed the T+1 return cut-off. The original sale cannot settle on time.", "lending"));
  }
  if (state.noticeA && !state.confirmedA) result.push(action("custody_confirm_a", "custody", "Confirm 150,000 shares received", "Confirm actual custody receipt from Broker A, separately from its notice.", "portfolio", "confirmed"));
  if (state.noticeB && !state.confirmedB) result.push(action("custody_confirm_b", "custody", "Confirm 100,000 shares received", "Confirm actual custody receipt from Broker B, separately from its notice.", "portfolio", "confirmed"));
  if (state.custodyConfirmedShares > 0 && state.shortfallShares > 0 && state.assessedShares !== state.custodyConfirmedShares) {
    result.push(action("assess_shortfall", "custody", `Report ${state.shortfallShares.toLocaleString("en-US")}-share shortfall`, "Report only custodian-confirmed shares as deliverable; a broker notice does not count.", "portfolio", "evidence"));
  }
  if (state.shortfallShares === 0) result.push(action("confirm_delivery", "custody", state.tPlusOneFailed ? "Record late 400,000-share recovery" : "Confirm 400,000 shares deliverable", state.tPlusOneFailed ? "Record that all shares eventually arrived; the original T+1 delivery still failed." : "Confirm the full T+1 sale quantity from free and custody-received shares.", "portfolio", "confirmed"));
  return result;
}

function advance(input: Record<string, unknown>, actionId: string): IdeaTransition {
  const previous = summarize(recallState(input));
  const selected = availableActions(previous).find(candidate => candidate.id === actionId);
  if (!selected) throw new Error("This securities recall action is unavailable or out of order.");
  const next = { ...previous };
  switch (actionId) {
    case "place_sale_order": next.orderPlaced = true; break;
    case "recall_broker_a": next.recallA = true; break;
    case "recall_broker_b": next.recallB = true; break;
    case "broker_a_return": next.noticeA = true; break;
    case "broker_b_return": next.noticeB = true; break;
    case "broker_b_delay": next.brokerBDelayed = true; next.tPlusOneFailed = true; break;
    case "custody_confirm_a": next.confirmedA = true; break;
    case "custody_confirm_b": next.confirmedB = true; break;
    case "assess_shortfall": next.assessedShares = previous.custodyConfirmedShares; break;
    case "confirm_delivery": next.delivered = true; break;
    default: throw new Error("Unknown securities recall action.");
  }
  return { state: summarize(next), label: selected.label, source: selected.source, target: selected.target, pathKind: selected.pathKind, reference: REFERENCE };
}

export const idea2: IdeaSpec = {
  id: 2,
  title: "Securities lending recall",
  summary: "Coordinate a 400,000-share T+1 sale across Vanguard desks, two prime brokers and custody.",
  roles: [
    {
      id: "portfolio", title: "Portfolio Manager", organization: "Vanguard · Equities", responsibility: "Owns the sale order and delivery decision.",
      metricLabel: "Sale to deliver", metricValue: "400,000 shares", workTitle: "Order blotter",
      sampleRecords: [
        { reference: "ORD-3174", title: "US equity rebalance", detail: "125,000 shares · T+2", status: "Sample · allocated" },
        { reference: "ORD-3182", title: "Index tracking adjustment", detail: "80,000 shares · T+1", status: "Sample · in review" },
        { reference: "ORD-3188", title: "ETF creation basket", detail: "42,500 shares · T+2", status: "Sample · staged" },
        { reference: "ORD-3191", title: "Corporate-action sale", detail: "30,000 shares · T+1", status: "Sample · settled" },
      ],
    },
    {
      id: "lending", title: "Securities Lending Officer", organization: "Vanguard · Lending Desk", responsibility: "Tracks loans, recalls and broker responses.",
      metricLabel: "Shares on loan", metricValue: "250,000", workTitle: "Loan and recall inventory",
      sampleRecords: [
        { reference: "LON-2901", title: "Large-cap recall", detail: "75,000 shares · Prime Broker C", status: "Sample · returned" },
        { reference: "LON-2906", title: "Index basket loan", detail: "60,000 shares · Prime Broker A", status: "Sample · active" },
        { reference: "LON-2910", title: "Income fund loan", detail: "20,000 shares · Prime Broker B", status: "Sample · review" },
        { reference: "LON-2913", title: "Allocation exception", detail: "12,500 shares · Prime Broker C", status: "Sample · flagged" },
      ],
    },
    {
      id: "broker_a", title: "Stock Loan Officer", organization: "Prime Broker A", responsibility: "Returns the first recalled loan and sends evidence to custody.",
      metricLabel: "Recall assigned", metricValue: "150,000 shares", workTitle: "Borrower return queue",
      sampleRecords: [
        { reference: "PBA-4102", title: "Morning recall", detail: "35,000 shares · client book", status: "Sample · returned" },
        { reference: "PBA-4107", title: "Collateral substitution", detail: "USD collateral · review", status: "Sample · in review" },
        { reference: "PBA-4114", title: "Borrower allocation", detail: "22,000 shares · T+1", status: "Sample · assigned" },
        { reference: "PBA-4120", title: "Return instruction", detail: "18,000 shares · custody route", status: "Sample · sent" },
      ],
    },
    {
      id: "broker_b", title: "Stock Loan Officer", organization: "Prime Broker B", responsibility: "Returns the second recalled loan or reports its delay.",
      metricLabel: "Recall assigned", metricValue: "100,000 shares", workTitle: "Borrower return queue",
      sampleRecords: [
        { reference: "PBB-5303", title: "Settlement recall", detail: "28,000 shares · T+1", status: "Sample · pending" },
        { reference: "PBB-5309", title: "Borrower substitution", detail: "15,000 shares · collateral", status: "Sample · review" },
        { reference: "PBB-5312", title: "Overnight loan", detail: "36,000 shares · client book", status: "Sample · returned" },
        { reference: "PBB-5318", title: "Locate request", detail: "11,500 shares · T+0", status: "Sample · assigned" },
      ],
    },
    {
      id: "custody", title: "Custody Settlement Officer", organization: "Global Custodian", responsibility: "Verifies actual receipts and whether the whole sale can settle.",
      metricLabel: "Initially free", metricValue: "150,000 shares", workTitle: "Position and settlement monitor",
      sampleRecords: [
        { reference: "CUS-6130", title: "Equity delivery", detail: "50,000 shares · T+1", status: "Sample · matched" },
        { reference: "CUS-6134", title: "Broker receipt", detail: "23,000 shares · Prime Broker C", status: "Sample · verified" },
        { reference: "CUS-6139", title: "Fail investigation", detail: "9,000 shares · unmatched", status: "Sample · flagged" },
        { reference: "CUS-6146", title: "Position reconciliation", detail: "14,500 shares · internal", status: "Sample · completed" },
      ],
    },
  ],
  initialState: baseState,
  actions: availableActions,
  transition: advance,
};
