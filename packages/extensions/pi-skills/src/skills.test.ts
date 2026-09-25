import { expect, it } from "vite-plus/test";

import { getCompletableSkillNames, getSkillPaths } from "./skills.ts";
import { command } from "./test-fixture.ts";

it("uses registered names and Markdown paths verbatim without deriving a directory", () => {
  expect(
    getSkillPaths([
      command("skill:review", "skill", "/odd path/../review notes.md"),
      command("skill:other", "prompt"),
      command("skill:tool", "extension")
    ])
  ).toEqual(new Map([["/skill:review", "/odd path/../review notes.md"]]));
});

it("excludes cross-source collisions regardless of description or catalog order", () => {
  const commands = [
    command("skill:review", "skill", "/skills/review.md"),
    command("skill:review", "extension"),
    command("skill:plan", "prompt"),
    command("skill:plan", "skill", "/skills/plan.md"),
    command("skill:clear", "skill", "/skills/clear.md"),
    command("clear", "extension")
  ];
  expect(getCompletableSkillNames(commands)).toEqual(new Set(["skill:clear"]));
  expect(getCompletableSkillNames([...commands].reverse())).toEqual(new Set(["skill:clear"]));
  expect(getSkillPaths(commands)).toEqual(
    new Map([
      ["/skill:review", "/skills/review.md"],
      ["/skill:plan", "/skills/plan.md"],
      ["/skill:clear", "/skills/clear.md"]
    ])
  );
});
