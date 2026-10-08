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

export function getIdeaSpec(ideaKey: IdeaKey): IdeaSpec | null {
  return ideaKey === 2 ? idea2 : ideaKey === 3 ? idea3 : ideaKey === 4 ? idea4 : null;
}

export function roleTitle(ideaKey: IdeaKey, role: string): string {
  if (ideaKey === 1) return IDEA1_ROLE_TITLES[role as keyof typeof IDEA1_ROLE_TITLES] ?? role;
  return getIdeaSpec(ideaKey)?.roles.find(item => item.id === role)?.title ?? role;
}
