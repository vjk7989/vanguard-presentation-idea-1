import { describe, expect, it } from "vitest";
import { getIdeaSpec } from "../../src/lib/ideas";
import { practiceTemplate, practiceTemplates } from "../../src/lib/practice-catalog";
import { SAMPLE_DESK_RECORDS } from "../../src/lib/mock-queue";

describe("role-specific presentation work", () => {
  it("offers exactly two authorized templates for every role", () => {
    for (const role of ["issuer", "fund", "bank"]) {
      const templates = practiceTemplates(1, role);
      expect(templates).toHaveLength(2);
      expect(templates.every(item => item.owner === role && item.counterpart !== role)).toBe(true);
      expect(SAMPLE_DESK_RECORDS[role as keyof typeof SAMPLE_DESK_RECORDS]).toHaveLength(8);
    }
    for (const idea of [2, 3, 4] as const) {
      const spec = getIdeaSpec(idea)!;
      for (const role of spec.roles) {
        expect(role.sampleRecords).toHaveLength(8);
        const templates = practiceTemplates(idea, role.id);
        expect(templates).toHaveLength(2);
        expect(templates.every(item => item.owner === role.id && item.counterpart !== role.id)).toBe(true);
        expect(practiceTemplate(idea, templates[0].id)).toEqual(templates[0]);
      }
    }
  });

  it("does not accept a template from another idea", () => {
    expect(practiceTemplate(1, "portfolio-review")).toBeNull();
    expect(practiceTemplate(2, "issuer-payee-review")).toBeNull();
  });
});
