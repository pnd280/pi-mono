import { describe, expect, it } from "vite-plus/test";

import { expandSkillTokens, findSkillToken } from "./tokens.ts";

const paths = new Map([
  ["/skill:review", "/skills/review/SKILL.md"],
  ["/skill:plan", "/skills/my plan/../plan notes.md"]
]);

describe("expansion", () => {
  it.each([
    ["/skill:review", "/skill:/skills/review/SKILL.md"],
    ["Use /skill:review now", "Use /skill:/skills/review/SKILL.md now"],
    ["Use /skill:review", "Use /skill:/skills/review/SKILL.md"],
    [
      " \t/skill:review\r\n/skill:plan  /skill:review\t\n",
      " \t/skill:/skills/review/SKILL.md\r\n/skill:/skills/my plan/../plan notes.md  /skill:/skills/review/SKILL.md\t\n"
    ],
    ["```md\n/skill:review\n```", "```md\n/skill:/skills/review/SKILL.md\n```"],
    ["/skill:unknown /skill:Review", "/skill:unknown /skill:Review"],
    ["", ""]
  ])("preserves whitespace and replaces exact tokens: %j", (text, expected) => {
    expect(expandSkillTokens(text, paths)).toBe(expected);
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
      "/skill:review /skill:/skills/other.md"
    );
  });
});

describe("cursor tokens", () => {
  it.each([
    ["/skill:re", 9, { start: 0, end: 9, query: "/skill:re" }],
    ["  use\t/skill:review rest", 15, { start: 6, end: 19, query: "/skill:re" }],
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
