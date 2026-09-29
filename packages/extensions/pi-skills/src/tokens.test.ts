import { describe, expect, it } from "vite-plus/test";

import { expandSkillTokens, findSkillToken } from "./tokens.ts";

const paths = new Map([
  ["/skill:review", "/skills/review/SKILL.md"],
  ["/skill:plan", "/skills/my plan/../plan notes.md"]
]);

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
    expect(expandSkillTokens(text, paths)).toBe(expected);
  });

  it("does not rescan skill-shaped tokens inside a previously inserted path", () => {
    const embedded = new Map(paths);
    embedded.set("/skill:review", "/skills/notes /skill:plan SKILL.md");

    const expanded = expandSkillTokens("/skill:review", embedded);

    expect(expanded).toBe("[/skill:review](/skills/notes /skill:plan SKILL.md)");
    expect(expandSkillTokens(expanded, embedded)).toBe(expanded);
  });

  it.each([
    ["{path}", "/skills/review/SKILL.md"],
    [" {command} ({path})", " /skill:review (/skills/review/SKILL.md)"],
    [
      "Read {path} for {command} ({path})",
      "Read /skills/review/SKILL.md for /skill:review (/skills/review/SKILL.md)"
    ]
  ])("uses the configured format: %s", (format, expected) => {
    expect(expandSkillTokens("/skill:review", paths, format)).toBe(expected);
  });

  it("does not rescan custom references, including skill tokens inside paths", () => {
    const embedded = new Map(paths);
    embedded.set("/skill:review", "/skills/notes {command} /skill:plan SKILL.md");
    const format = "File: {path} for {command}";
    const expanded = "File: /skills/notes {command} /skill:plan SKILL.md for /skill:review";

    expect(expandSkillTokens("/skill:review", embedded, format)).toBe(expanded);
    expect(expandSkillTokens(`${expanded} /skill:plan`, embedded, format)).toBe(
      `${expanded} File: /skills/my plan/../plan notes.md for /skill:plan`
    );
  });

  it("protects the longest matching reference when configured outputs share a prefix", () => {
    const overlapping = new Map([
      ["/skill:review", "/skills/notes"],
      ["/skill:plan", "/skills/notes /skill:review SKILL.md"]
    ]);
    const format = "File: {path}";
    const expanded = expandSkillTokens("/skill:plan", overlapping, format);

    expect(expanded).toBe("File: /skills/notes /skill:review SKILL.md");
    expect(expandSkillTokens(expanded, overlapping, format)).toBe(expanded);
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
    expect(expandSkillTokens(text, paths)).toBe(text);
  });

  it("uses literal registered keys even with punctuation and never rescans inserted paths", () => {
    const unusual = new Map([
      ["/skill:review,", "review"],
      ["/skill:review", "/skills/other.md"]
    ]);
    expect(expandSkillTokens("/skill:review, /skill:review", unusual)).toBe(
      "[/skill:review,](review) [/skill:review](/skills/other.md)"
    );
  });
});

describe("cursor tokens", () => {
  it.each([
    ["/skill:review", 7, { start: 0, end: 13, query: "/skill:" }],
    ["/skill:review", 6, undefined],
    ["x/skill:re", 10, undefined],
    ["`/skill:re", 10, undefined],
    ["/skill:re ", 10, undefined],
    ["", 0, undefined]
  ])("locates the complete token in %j at %i", (line, col, expected) => {
    expect(findSkillToken(line, col)).toEqual(expected);
  });
});
