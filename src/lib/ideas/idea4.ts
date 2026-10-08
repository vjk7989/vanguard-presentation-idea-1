import type { IdeaAction, IdeaSpec, IdeaTransition } from "./types";

type TaxStage =
  | "proof_needed"
  | "proof_requested"
  | "valid_proof_issued"
  | "expired_proof_issued"
  | "expiry_flagged"
  | "renewal_requested"
  | "renewed_proof_issued"
  | "proof_verified"
  | "claim_submitted"
  | "relief_confirmed";

type TaxState = Record<string, unknown> & {
  stage: TaxStage;
  dividendReference: string;
  dividendAmount: string;
  issuerCountry: string;
  pensionResidence: string;
  certificateReference: string | null;
  certificateExpiresOn: string | null;
  certificateStatus: "none" | "valid" | "expired" | "verified";
  claimReference: string | null;
  claimStatus: "not_submitted" | "pending" | "simulated_confirmed";
  asOfDate: string;
};

const DIVIDEND_REFERENCE = "FR-DIV-2026-1042";
const CERTIFICATE_REFERENCE = "ETRC-NL-2026-041";
const RENEWED_CERTIFICATE_REFERENCE = "ETRC-NL-2026-041-R1";
const CLAIM_REFERENCE = "RAS-FR-2026-1042";

function initialState(): TaxState {
  return {
    stage: "proof_needed",
    dividendReference: DIVIDEND_REFERENCE,
    dividendAmount: "€1,000,000",
    issuerCountry: "France",
    pensionResidence: "Netherlands",
    certificateReference: null,
    certificateExpiresOn: null,
    certificateStatus: "none",
    claimReference: null,
    claimStatus: "not_submitted",
    asOfDate: "2026-10-09",
  };
}

function stageOf(state: Record<string, unknown>): TaxStage {
  const stage = state.stage;
  if (
    stage !== "proof_needed" && stage !== "proof_requested" &&
    stage !== "valid_proof_issued" && stage !== "expired_proof_issued" &&
    stage !== "expiry_flagged" && stage !== "renewal_requested" &&
    stage !== "renewed_proof_issued" && stage !== "proof_verified" &&
    stage !== "claim_submitted" && stage !== "relief_confirmed"
  ) {
    throw new Error("This tax-proof run has an invalid stage.");
  }
  return stage;
}

const actionsByStage: Record<TaxStage, IdeaAction[]> = {
  proof_needed: [
    { id: "request_residence_proof", role: "pension", label: "Request residence proof", detail: "Ask for synthetic residence evidence for the €1m French dividend.", source: "pension", target: "simulated_authority", pathKind: "instruction" },
  ],
  proof_requested: [
    { id: "issue_valid_proof", role: "presenter", label: "Simulate valid certificate", detail: "The presenter simulates tax-authority issuance of a valid eTRC; no real authority is contacted.", source: "simulated_authority", target: "tax_compliance", pathKind: "evidence" },
    { id: "issue_expired_proof", role: "presenter", label: "Simulate expired certificate", detail: "Exception path: the synthetic eTRC expired before this demo's reference date.", source: "simulated_authority", target: "tax_compliance", pathKind: "evidence" },
  ],
  valid_proof_issued: [
    { id: "verify_residence_proof", role: "tax_compliance", label: "Verify certificate", detail: "Check the synthetic certificate reference, residence, dividend, and expiry before releasing it to the depositary.", source: "tax_compliance", target: "depositary", pathKind: "evidence" },
  ],
  expired_proof_issued: [
    { id: "flag_expired_proof", role: "tax_compliance", label: "Flag expired certificate", detail: "Reject the expired evidence and request a renewal; a relief claim is blocked.", source: "tax_compliance", target: "pension", pathKind: "instruction" },
  ],
  expiry_flagged: [
    { id: "request_renewal", role: "pension", label: "Request certificate renewal", detail: "Ask the simulated issuing authority to replace the expired proof.", source: "pension", target: "simulated_authority", pathKind: "instruction" },
  ],
  renewal_requested: [
    { id: "issue_renewed_proof", role: "presenter", label: "Simulate renewed certificate", detail: "The presenter issues a new synthetic eTRC for this walkthrough.", source: "simulated_authority", target: "tax_compliance", pathKind: "evidence" },
  ],
  renewed_proof_issued: [
    { id: "verify_renewed_proof", role: "tax_compliance", label: "Verify renewed certificate", detail: "Validate the replacement evidence before forwarding it to the depositary.", source: "tax_compliance", target: "depositary", pathKind: "evidence" },
  ],
  proof_verified: [
    { id: "submit_relief_claim", role: "depositary", label: "Submit relief-at-source claim", detail: "Submit the synthetic proof package. Submission is not approval or payment of tax relief.", source: "depositary", target: "simulated_authority", pathKind: "instruction" },
  ],
  claim_submitted: [
    { id: "confirm_simulated_relief", role: "presenter", label: "Simulate authority confirmation", detail: "Optional presenter-only demonstration of an explicit synthetic decision; no real tax relief is granted.", source: "simulated_authority", target: "depositary", pathKind: "confirmed" },
  ],
  relief_confirmed: [],
};

function actions(state: Record<string, unknown>): IdeaAction[] {
  return actionsByStage[stageOf(state)];
}

function transition(state: Record<string, unknown>, actionId: string): IdeaTransition {
  const action = actions(state).find((candidate) => candidate.id === actionId);
  if (!action) throw new Error("This tax-proof action is not available at the current step.");

  let next: TaxState;
  switch (actionId) {
    case "request_residence_proof":
      next = { ...state, stage: "proof_requested" } as TaxState;
      break;
    case "issue_valid_proof":
      next = { ...state, stage: "valid_proof_issued", certificateReference: CERTIFICATE_REFERENCE, certificateExpiresOn: "2027-10-08", certificateStatus: "valid" } as TaxState;
      break;
    case "issue_expired_proof":
      next = { ...state, stage: "expired_proof_issued", certificateReference: CERTIFICATE_REFERENCE, certificateExpiresOn: "2026-09-09", certificateStatus: "expired" } as TaxState;
      break;
    case "flag_expired_proof":
      next = { ...state, stage: "expiry_flagged" } as TaxState;
      break;
    case "request_renewal":
      next = { ...state, stage: "renewal_requested" } as TaxState;
      break;
    case "issue_renewed_proof":
      next = { ...state, stage: "renewed_proof_issued", certificateReference: RENEWED_CERTIFICATE_REFERENCE, certificateExpiresOn: "2027-10-08", certificateStatus: "valid" } as TaxState;
      break;
    case "verify_residence_proof":
    case "verify_renewed_proof":
      next = { ...state, stage: "proof_verified", certificateStatus: "verified" } as TaxState;
      break;
    case "submit_relief_claim":
      next = { ...state, stage: "claim_submitted", claimReference: CLAIM_REFERENCE, claimStatus: "pending" } as TaxState;
      break;
    case "confirm_simulated_relief":
      next = { ...state, stage: "relief_confirmed", claimStatus: "simulated_confirmed" } as TaxState;
      break;
    default:
      throw new Error("Unknown tax-proof action.");
  }

  return {
    state: next,
    label: action.label,
    source: action.source,
    target: action.target,
    pathKind: action.pathKind,
    reference: actionId === "request_residence_proof" ? DIVIDEND_REFERENCE : actionId.includes("claim") || actionId.includes("relief") ? CLAIM_REFERENCE : next.certificateReference ?? DIVIDEND_REFERENCE,
  };
}

export const idea4: IdeaSpec = {
  id: 4,
  title: "Withholding-tax proof",
  summary: "Trace a fictional Dutch pension scheme's evidence for relief at source on a €1m French dividend.",
  roles: [
    {
      id: "pension",
      title: "Pension Scheme Tax Officer",
      organization: "Dutch pension scheme",
      responsibility: "Request and maintain residence evidence for cross-border dividends.",
      metricLabel: "Dividend in focus",
      metricValue: "€1m",
      workTitle: "Certificate portfolio",
      sampleRecords: [
        { reference: "DIV-FR-1042", title: "French issuer dividend", detail: "Synthetic €1m distribution · proof required", status: "Needs proof" },
        { reference: "ETRC-NL-041", title: "Dutch residence certificate", detail: "Example certificate package · fictional", status: "Sample" },
        { reference: "DIV-DE-0920", title: "German issuer dividend", detail: "Example proof request in review", status: "Review" },
        { reference: "DIV-BE-0897", title: "Belgian issuer dividend", detail: "Example residence document archived", status: "Filed" },
        { reference: "DIV-IT-0814", title: "Italian issuer dividend", detail: "Example upcoming evidence refresh", status: "Upcoming" },
      ],
    },
    {
      id: "tax_compliance",
      title: "Fund Administrator Tax Compliance Analyst",
      organization: "Fund administrator",
      responsibility: "Validate synthetic residence evidence and resolve expiry exceptions before forwarding it.",
      metricLabel: "Evidence checks",
      metricValue: "5",
      workTitle: "Proof review queue",
      sampleRecords: [
        { reference: "CHK-FR-1042", title: "French dividend proof", detail: "Check residence, reference, and expiry", status: "Awaiting proof" },
        { reference: "CHK-DE-0920", title: "German proof package", detail: "Example cross-border document review", status: "In review" },
        { reference: "CHK-BE-0897", title: "Belgian certificate", detail: "Example evidence trail complete", status: "Verified" },
        { reference: "CHK-IT-0814", title: "Italian document refresh", detail: "Example certificate nearing expiry", status: "Attention" },
        { reference: "CHK-ES-0763", title: "Spanish residence query", detail: "Example clarification from scheme", status: "Open" },
      ],
    },
    {
      id: "depositary",
      title: "Depositary Corporate Actions Officer",
      organization: "Depositary",
      responsibility: "Submit supported relief-at-source claims and track responses without assuming approval.",
      metricLabel: "Claims monitored",
      metricValue: "5",
      workTitle: "Dividend claims",
      sampleRecords: [
        { reference: "RAS-FR-1042", title: "French dividend relief", detail: "Synthetic proof package not yet received", status: "Waiting" },
        { reference: "RAS-DE-0920", title: "German dividend claim", detail: "Example claim awaiting decision", status: "Pending" },
        { reference: "RAS-BE-0897", title: "Belgian dividend claim", detail: "Example record reconciled", status: "Reconciled" },
        { reference: "RAS-IT-0814", title: "Italian dividend claim", detail: "Example exception awaiting evidence", status: "Exception" },
        { reference: "RAS-ES-0763", title: "Spanish dividend claim", detail: "Example submission checklist", status: "Draft" },
      ],
    },
  ],
  initialState,
  actions,
  transition,
};
