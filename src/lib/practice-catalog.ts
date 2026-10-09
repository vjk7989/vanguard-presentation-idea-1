import { getIdeaSpec, type IdeaKey } from "./ideas";

export type PracticeTemplate = { id: string; owner: string; counterpart: string; title: string; detail: string };

const reserveTemplates: PracticeTemplate[] = [
  { id: "issuer-payee-review", owner: "issuer", counterpart: "bank", title: "Request payee verification", detail: "Ask Banking Operations to verify a fictional holder payout reference." },
  { id: "issuer-liquidity-note", owner: "issuer", counterpart: "fund", title: "Request liquidity clarification", detail: "Ask Fund Operations for a simulated redemption-status explanation." },
  { id: "fund-settlement-check", owner: "fund", counterpart: "bank", title: "Request settlement trace", detail: "Ask Banking Operations for a fictional proceeds reference trace." },
  { id: "fund-batch-clarification", owner: "fund", counterpart: "issuer", title: "Clarify redemption batch", detail: "Send Issuer Treasury a fictional batch-matching question." },
  { id: "bank-payee-exception", owner: "bank", counterpart: "issuer", title: "Flag payee exception", detail: "Notify Issuer Treasury of a fictional payee-reference exception." },
  { id: "bank-fund-reference", owner: "bank", counterpart: "fund", title: "Request fund reference", detail: "Ask Fund Operations to clarify a simulated incoming proceeds label." },
];

export function practiceTemplates(ideaKey: IdeaKey, role: string): PracticeTemplate[] {
  if (ideaKey === 1) return reserveTemplates.filter(item => item.owner === role);
  const spec = getIdeaSpec(ideaKey);
  const deskIndex = spec?.roles.findIndex(item => item.id === role) ?? -1;
  if (!spec || deskIndex < 0) return [];
  const desk = spec.roles[deskIndex];
  const next = spec.roles[(deskIndex + 1) % spec.roles.length];
  const previous = spec.roles[(deskIndex + spec.roles.length - 1) % spec.roles.length];
  return [
    { id: `${role}-review`, owner: role, counterpart: next.id,
      title: `Review ${desk.sampleRecords[1].title.toLowerCase()}`,
      detail: `${desk.sampleRecords[1].detail}. Request a fictional counterparty check from ${next.title}.` },
    { id: `${role}-clarify`, owner: role, counterpart: previous.id,
      title: `Clarify ${desk.sampleRecords[2].title.toLowerCase()}`,
      detail: `${desk.sampleRecords[2].detail}. Send a fictional status question to ${previous.title}.` },
  ];
}

export function practiceTemplate(ideaKey: IdeaKey, templateId: string): PracticeTemplate | null {
  const roles = ideaKey === 1 ? ["issuer", "fund", "bank"] : getIdeaSpec(ideaKey)?.roles.map(role => role.id) ?? [];
  return roles.flatMap(role => practiceTemplates(ideaKey, role)).find(item => item.id === templateId) ?? null;
}
