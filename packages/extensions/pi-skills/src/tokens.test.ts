import { describe, expect, it } from "vite-plus/test";

import { command } from "./test-fixture.ts";
import { expandSkillInput } from "./tokens.ts";

const commands = [
  command("skill:review", "skill", "/skills/review/SKILL.md"),
  command("skill:plan", "skill", "/skills/my plan/../plan notes.md")
];

describe("expansion", () => {
  it.each([
    ["Use /skill:review now", "Use [/skill:review](/skills/review/SKILL.md) now"],
    [
      " \t/skill:review\r\n/skill:plan  /skill:review\t\n",
      " \t[/skill:review](/skills/review/SKILL.md)\r\n[/skill:plan](/skills/my plan/../plan notes.md)  [/skill:review](/skills/review/SKILL.md)\t\n"
    ],
    ["```md\n/skill:review\n```", "```md\n[/skill:review](/skills/review/SKILL.md)\n```"],
    ["/skill:unknown /skill:Review", "/skill:unknown /skill:Review"],
    ["", ""]
  ])("preserves whitespace and replaces exact tokens: %j", (text, expected) => {
    expect(expandSkillInput(text, commands)).toBe(expected);
  });

  it("does not rescan skill-shaped tokens inside a previously inserted path", () => {
    const embedded = [
      command("skill:review", "skill", "/skills/notes /skill:plan SKILL.md"),
      commands[1]!
    ];

    const expanded = expandSkillInput("/skill:review", embedded);

    expect(expanded).toBe("[/skill:review](/skills/notes /skill:plan SKILL.md)");
    expect(expandSkillInput(expanded, embedded)).toBe(expanded);
  });

  it.each([
    ["{path}", "/skills/review/SKILL.md"],
    ["{command} ({path})", " /skill:review (/skills/review/SKILL.md)"],
    [" {command} ({path})", " /skill:review (/skills/review/SKILL.md)"],
    ["{command}\t{path}", "/skill:review\t/skills/review/SKILL.md"],
    ["{command}\n{path}", "/skill:review\n/skills/review/SKILL.md"],
    [
      "{path} {path} {command} {command}",
      "/skills/review/SKILL.md /skills/review/SKILL.md /skill:review /skill:review"
    ],
    [
      "Read {path} for {command} ({path})",
      "Read /skills/review/SKILL.md for /skill:review (/skills/review/SKILL.md)"
    ]
  ])("uses the configured format: %s", (format, expected) => {
    expect(expandSkillInput("/skill:review", commands, format)).toBe(expected);
  });

  it("does not rescan custom references, including skill tokens inside paths", () => {
    const embedded = [
      command("skill:review", "skill", "/skills/notes {command} /skill:plan SKILL.md"),
      commands[1]!
    ];
    const format = "File: {path} for {command}";
    const expanded = "File: /skills/notes {command} /skill:plan SKILL.md for /skill:review";

    expect(expandSkillInput("/skill:review", embedded, format)).toBe(expanded);
    expect(expandSkillInput(`${expanded} /skill:plan`, embedded, format)).toBe(
      `${expanded} File: /skills/my plan/../plan notes.md for /skill:plan`
    );
  });

  it("protects the longest matching reference when configured outputs share a prefix", () => {
    const overlapping = [
      command("skill:review", "skill", "/skills/notes"),
      command("skill:plan", "skill", "/skills/notes /skill:review SKILL.md")
    ];
    const format = "File: {path}";
    const expanded = expandSkillInput("/skill:plan", overlapping, format);

    expect(expanded).toBe("File: /skills/notes /skill:review SKILL.md");
    expect(expandSkillInput(expanded, overlapping, format)).toBe(expanded);
  });

  it.each([
    "/skill:review,",
    "(/skill:review)",
    "`/skill:review`",
    "x/skill:review",
    "/skill:review-extra",
    "/skill:review/",
    "'/skill:review'",
    "/skill:review\u200b"
  ])("leaves attached text untouched: %s", (text) => {
    expect(expandSkillInput(text, commands)).toBe(text);
  });

  it("uses literal registered keys even with punctuation", () => {
    const unusual = [
      command("skill:review,", "skill", "review"),
      command("skill:review", "skill", "/skills/other.md")
    ];
    expect(expandSkillInput("/skill:review, /skill:review", unusual)).toBe(
      "[/skill:review,](review) [/skill:review](/skills/other.md)"
    );
  });

  it("uses colliding skill records and literal paths, ignoring other command sources", () => {
    const catalog = [
      command("skill:review", "skill", "/odd path/../review notes.md"),
      command("skill:review", "extension"),
      command("skill:plan", "prompt"),
      command("skill:plan", "skill", "/skills/plan.md"),
      command("skill:other", "prompt"),
      command("skill:clear", "skill", "/skills/clear.md"),
      command("clear", "extension")
    ];
    const text = "/skill:review /skill:plan /skill:clear /skill:other /clear";
    const expected =
      "[/skill:review](/odd path/../review notes.md) [/skill:plan](/skills/plan.md) [/skill:clear](/skills/clear.md) /skill:other /clear";

    expect(expandSkillInput(text, catalog)).toBe(expected);
    expect(expandSkillInput(text, [...catalog].reverse())).toBe(expected);
    expect(expandSkillInput(text, [])).toBe(text);
  });

  it("guards existing command-leading references without padding guarded or inline text", () => {
    const format = "{command} ({path})";
    const reference = "/skill:review (/skills/review/SKILL.md)";
    expect(expandSkillInput(reference, commands, format)).toBe(` ${reference}`);
    expect(expandSkillInput(` ${reference}`, commands, format)).toBe(` ${reference}`);
    expect(expandSkillInput(`Use ${reference}`, commands, format)).toBe(`Use ${reference}`);
    expect(expandSkillInput("/skill:unknown (/unknown.md)", commands, format)).toBe(
      "/skill:unknown (/unknown.md)"
    );
  });

  it("guards a registered leading command produced by substitution without rescanning it", () => {
    const catalog = [
      command("skill:review", "skill", "/skill:plan"),
      command("skill:plan", "skill", "/skills/plan.md")
    ];
    expect(expandSkillInput("/skill:review", catalog, "{path}")).toBe(" /skill:plan");
  });
});
