import { describe, expect, it } from "vite-plus/test";

import { expandSkillReferences, type SkillReferenceCatalog } from "./skill-reference.ts";

const catalog = (skills: Record<string, string>): SkillReferenceCatalog => ({
  skills: new Map(Object.entries(skills)),
  templates: new Set()
});
const commandToken = (token: string) => token;

describe("native skill-insertion guard", () => {
  const review = catalog({ "/skill:review": "/skills/review/SKILL.md" });

  it("guards existing command-leading references without padding them twice", () => {
    const format = "{command} ({path})";
    const reference = "/skill:review (/skills/review/SKILL.md)";
    expect(
      expandSkillReferences(reference, { catalog: review, format, resolve: commandToken })
    ).toBe(` ${reference}`);
    expect(
      expandSkillReferences(` ${reference}`, { catalog: review, format, resolve: commandToken })
    ).toBe(` ${reference}`);
  });

  it("guards a registered leading command produced by substitution without rescanning it", () => {
    const chained = catalog({
      "/skill:review": "/skill:plan",
      "/skill:plan": "/skills/plan.md"
    });
    expect(
      expandSkillReferences("/skill:review", {
        catalog: chained,
        format: "{path}",
        resolve: commandToken
      })
    ).toBe(" /skill:plan");
  });

  it("leaves an ordinary leading skill command unchanged", () => {
    expect(
      expandSkillReferences("/skill:review rest", {
        catalog: review,
        format: "{command} ({path})",
        resolve: () => undefined
      })
    ).toBe("/skill:review rest");
  });
});
