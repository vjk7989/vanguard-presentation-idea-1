import { idea2 } from "./idea2";
import { idea3 } from "./idea3";
import { idea4 } from "./idea4";
import type { IdeaKey, IdeaSpec } from "./types";

export { idea2, idea3, idea4 };
export type { IdeaKey, IdeaSpec };

export const IDEA_TITLES: Record<IdeaKey, string> = {
  1: "Stablecoin reserves",
  2: "Securities lending recall",
  3: "Currency hedge contract",
  4: "Withholding-tax proof",
};

export const IDEA1_ROLE_TITLES: Record<"issuer" | "fund" | "bank", string> = {
  issuer: "Issuer Treasury Analyst",
  fund: "Vanguard Fund Operations Specialist",
  bank: "Bank Payments Officer",
};

function withEightDeskRecords(spec: IdeaSpec): IdeaSpec {
  return { ...spec, roles: spec.roles.map(role => {
    const base = role.sampleRecords;
    const extras = Array.from({ length: Math.max(0, 8 - base.length) }, (_, index) => {
      const source = base[(index + 1) % base.length];
      return { reference: `${source.reference}-F${index + 1}`, title: `${source.title} follow-up`,
        detail: `${source.detail}. Fictional follow-up for the ${role.title} workbench.`,
        status: index % 2 === 0 ? "Sample · awaiting review" : "Sample · context filed" };
    });
    return { ...role, sampleRecords: [...base, ...extras] };
  }) };
}

const enriched: Record<2 | 3 | 4, IdeaSpec> = {
  2: withEightDeskRecords(idea2), 3: withEightDeskRecords(idea3), 4: withEightDeskRecords(idea4),
};

export function getIdeaSpec(ideaKey: IdeaKey): IdeaSpec | null {
  return ideaKey === 1 ? null : enriched[ideaKey];
}

export function roleTitle(ideaKey: IdeaKey, role: string): string {
  if (ideaKey === 1) return IDEA1_ROLE_TITLES[role as keyof typeof IDEA1_ROLE_TITLES] ?? role;
  return getIdeaSpec(ideaKey)?.roles.find(item => item.id === role)?.title ?? role;
}
