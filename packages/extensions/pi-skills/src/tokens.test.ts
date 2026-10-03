import { describe, expect, it } from "vite-plus/test";

import { command } from "./test-fixture.ts";
import { expandSkillInput } from "./tokens.ts";

const commands = [
  command("skill:review", "skill", "/skills/review/SKILL.md"),
  command("skill:plan", "skill", "/skills/my plan/../plan notes.md")
];

describe("native skill-insertion guard", () => {
  it.each([
    ["{command} ({path})", " /skill:review (/skills/review/SKILL.md)"],
    [" {command} ({path})", " /skill:review (/skills/review/SKILL.md)"],
    ["{command}\t{path}", "/skill:review\t/skills/review/SKILL.md"],
    ["{command}\n{path}", "/skill:review\n/skills/review/SKILL.md"]
  ])("uses the configured format: %s", (format, expected) => {
    expect(expandSkillInput("/skill:review", commands, format)).toBe(expected);
  });

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
