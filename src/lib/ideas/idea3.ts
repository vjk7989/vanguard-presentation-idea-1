import type { IdeaAction, IdeaSpec, IdeaTransition } from "./types";

type HedgeStage =
  | "awaiting_snapshot"
  | "snapshot_recorded"
  | "fund_valued"
  | "valuation_disputed"
  | "margin_agreed"
  | "call_issued"
  | "payment_confirmed"
  | "booked";

type HedgeState = Record<string, unknown> & {
  stage: HedgeStage;
  reference: string;
  notionalEur: string;
  fundMarginUsd: string;
  dealerMarginUsd: string;
  agreedMarginUsd: string | null;
  paymentStatus: "not_requested" | "pending" | "confirmed";
  accountingStatus: "unbooked" | "booked";
};

const REFERENCE = "FXH-400-001";

const STAGES: HedgeStage[] = [
  "awaiting_snapshot",
  "snapshot_recorded",
  "fund_valued",
  "valuation_disputed",
  "margin_agreed",
  "call_issued",
  "payment_confirmed",
  "booked",
];

const STEPS: (IdeaAction & { from: HedgeStage; to: HedgeStage })[] = [
  {
    id: "capture_snapshot",
    role: "hedge",
    label: "Record 4 pm market snapshot",
    detail: "Freeze the simulated EUR/USD reference for the €400m forward; no FX formula is asserted.",
    source: "hedge",
    target: "dealer",
    pathKind: "evidence",
    from: "awaiting_snapshot",
    to: "snapshot_recorded",
  },
  {
    id: "submit_fund_valuation",
    role: "hedge",
    label: "Send fund valuation · $1.80m",
    detail: "Send the fund desk's fictional $1.80m margin view to the dealer.",
    source: "hedge",
    target: "dealer",
    pathKind: "instruction",
    from: "snapshot_recorded",
    to: "fund_valued",
  },
  {
    id: "raise_valuation_dispute",
    role: "dealer",
    label: "Flag dealer valuation · $1.83m",
    detail: "The dealer's later-price view differs by $30,000; resolution is pending.",
    source: "dealer",
    target: "hedge",
    pathKind: "instruction",
    from: "fund_valued",
    to: "valuation_disputed",
  },
  {
    id: "agree_margin",
    role: "hedge",
    label: "Agree margin basis · $1.80m",
    detail: "Resolve the fictional valuation dispute using the agreed 4 pm snapshot.",
    source: "hedge",
    target: "dealer",
    pathKind: "evidence",
    from: "valuation_disputed",
    to: "margin_agreed",
  },
  {
    id: "issue_margin_call",
    role: "dealer",
    label: "Issue $1.80m margin call",
    detail: "Send a simulated payment instruction to the paying bank; cash is still pending.",
    source: "dealer",
    target: "paying_bank",
    pathKind: "instruction",
    from: "margin_agreed",
    to: "call_issued",
  },
  {
    id: "confirm_margin_payment",
    role: "paying_bank",
    label: "Confirm $1.80m payment",
    detail: "Confirm the simulated bank payment before accounting may book it.",
    source: "paying_bank",
    target: "accounting",
    pathKind: "confirmed",
    from: "call_issued",
    to: "payment_confirmed",
  },
  {
    id: "book_confirmed_payment",
    role: "accounting",
    label: "Book confirmed margin payment",
    detail: "Post the fictional journal only after the paying bank's confirmation.",
    source: "accounting",
    target: "hedge",
    pathKind: "evidence",
    from: "payment_confirmed",
    to: "booked",
  },
];

function readState(state: Record<string, unknown>): HedgeState {
  if (!STAGES.includes(state.stage as HedgeStage) || state.reference !== REFERENCE) {
    throw new Error("Invalid currency-hedge state.");
  }
  return state as HedgeState;
}

export const idea3: IdeaSpec = {
  id: 3,
  title: "Currency hedge contract",
  summary: "Agree the margin call across a fund, dealer, paying bank, and accounting desk.",
  roles: [
    {
      id: "hedge",
      title: "Vanguard Hedge Operations Analyst",
      organization: "Vanguard fund desk",
      responsibility: "Own the forward exposure, market snapshot, and fund-side valuation.",
      metricLabel: "Forward notional",
      metricValue: "€400m",
      workTitle: "Exposure & valuation workbench",
      sampleRecords: [
        { reference: "FXH-400-001", title: "EUR/USD forward margin review", detail: "Pitch case · fund view $1.80m", status: "Guided case" },
        { reference: "FXH-395-012", title: "Quarter-end hedge roll", detail: "€395m notional · sample record", status: "Reviewed" },
        { reference: "FXH-088-017", title: "Snapshot evidence", detail: "4 pm reference retained · sample record", status: "Archived" },
        { reference: "FXH-120-023", title: "Dealer difference", detail: "$12,000 variance · sample record", status: "Resolved" },
        { reference: "FXH-061-031", title: "Collateral threshold check", detail: "Policy review · sample record", status: "Queued" },
      ],
    },
    {
      id: "dealer",
      title: "Dealer Margin Analyst",
      organization: "Dealer bank",
      responsibility: "Compare valuations, resolve differences, and issue the agreed margin call.",
      metricLabel: "Dealer initial view",
      metricValue: "$1.83m",
      workTitle: "Margin disputes & calls",
      sampleRecords: [
        { reference: "FXH-400-001", title: "Fund valuation comparison", detail: "$1.80m versus $1.83m · pitch case", status: "Guided case" },
        { reference: "MRG-021-041", title: "Collateral substitution", detail: "Sample record · eligibility review", status: "Pending" },
        { reference: "MRG-034-018", title: "Dispute response", detail: "Sample record · two price sources", status: "Answered" },
        { reference: "MRG-015-057", title: "Intraday margin call", detail: "Sample record · counterparty notified", status: "Issued" },
        { reference: "MRG-048-062", title: "Threshold exception", detail: "Sample record · supervisor review", status: "Flagged" },
      ],
    },
    {
      id: "paying_bank",
      title: "Paying Bank Payments Officer",
      organization: "Paying bank",
      responsibility: "Track the instruction and confirm simulated payment independently.",
      metricLabel: "Pitch-case payment",
      metricValue: "$1.80m",
      workTitle: "Payment instruction queue",
      sampleRecords: [
        { reference: "FXH-400-001", title: "Margin payment instruction", detail: "$1.80m · pitch case", status: "Guided case" },
        { reference: "PAY-208-004", title: "Beneficiary review", detail: "Sample record · verification complete", status: "Released" },
        { reference: "PAY-309-015", title: "Incoming credit", detail: "Sample record · bank reference matched", status: "Confirmed" },
        { reference: "PAY-114-022", title: "Cut-off exception", detail: "Sample record · operations follow-up", status: "Pending" },
        { reference: "PAY-507-031", title: "Payment trace", detail: "Sample record · trace supplied", status: "Answered" },
      ],
    },
    {
      id: "accounting",
      title: "Fund Accounting Controller",
      organization: "Vanguard fund accounting",
      responsibility: "Reconcile bank evidence and book only confirmed margin payments.",
      metricLabel: "Unbooked pitch call",
      metricValue: "$1.80m",
      workTitle: "Journal & reconciliation queue",
      sampleRecords: [
        { reference: "FXH-400-001", title: "Margin journal", detail: "Await bank confirmation · pitch case", status: "Guided case" },
        { reference: "ACC-404-006", title: "Bank statement match", detail: "Sample record · reference aligned", status: "Matched" },
        { reference: "ACC-115-012", title: "FX accrual review", detail: "Sample record · period close", status: "Reviewed" },
        { reference: "ACC-221-019", title: "Unmatched payment", detail: "Sample record · investigation", status: "Flagged" },
        { reference: "ACC-031-028", title: "Margin ledger posting", detail: "Sample record · supporting evidence", status: "Posted" },
      ],
    },
  ],
  initialState(): HedgeState {
    return {
      stage: "awaiting_snapshot",
      reference: REFERENCE,
      notionalEur: "400000000",
      fundMarginUsd: "1800000",
      dealerMarginUsd: "1830000",
      agreedMarginUsd: null,
      paymentStatus: "not_requested",
      accountingStatus: "unbooked",
    };
  },
  actions(state: Record<string, unknown>): IdeaAction[] {
    const current = readState(state);
    return STEPS.filter(step => step.from === current.stage).map(step => ({
      id: step.id,
      role: step.role,
      label: step.label,
      detail: step.detail,
      source: step.source,
      target: step.target,
      pathKind: step.pathKind,
    }));
  },
  transition(state: Record<string, unknown>, actionId: string): IdeaTransition {
    const current = readState(state);
    const step = STEPS.find(candidate => candidate.id === actionId);
    if (!step) throw new Error("Unknown currency-hedge action.");
    if (step.from !== current.stage) throw new Error("This action is not the next currency-hedge step.");
    const next: HedgeState = {
      ...current,
      stage: step.to,
      agreedMarginUsd: step.to === "margin_agreed" ? "1800000" : current.agreedMarginUsd,
      paymentStatus: step.to === "call_issued" ? "pending" : step.to === "payment_confirmed" || step.to === "booked" ? "confirmed" : current.paymentStatus,
      accountingStatus: step.to === "booked" ? "booked" : current.accountingStatus,
    };
    return {
      state: next,
      label: step.label,
      source: step.source,
      target: step.target,
      pathKind: step.pathKind,
      reference: REFERENCE,
    };
  },
};
