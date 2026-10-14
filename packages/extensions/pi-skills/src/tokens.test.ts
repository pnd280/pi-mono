import { describe, expect, it } from "vite-plus/test";

import { command } from "./test-fixture.ts";
import { expandSkillInput } from "./tokens.ts";

const commands = [command("skill:review", "skill", "/skills/review/SKILL.md")];

describe("native skill-insertion guard", () => {
  it("guards existing command-leading references without padding them twice", () => {
    const format = "{command} ({path})";
    const reference = "/skill:review (/skills/review/SKILL.md)";
    expect(expandSkillInput(reference, commands, format)).toBe(` ${reference}`);
    expect(expandSkillInput(` ${reference}`, commands, format)).toBe(` ${reference}`);
  });

  it("guards a registered leading command produced by substitution without rescanning it", () => {
    const catalog = [
      command("skill:review", "skill", "/skill:plan"),
      command("skill:plan", "skill", "/skills/plan.md")
    ];
    expect(expandSkillInput("/skill:review", catalog, "{path}")).toBe(" /skill:plan");
  });
});
