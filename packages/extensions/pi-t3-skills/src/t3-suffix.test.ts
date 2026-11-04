import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { removeT3SkillSuffix } from "./t3-suffix.ts";

const skill = (name: string, path: string): SlashCommandInfo => ({
  name: `skill:${name}`,
  source: "skill",
  sourceInfo: { path, source: "fixture", scope: "temporary", origin: "top-level" }
});

const commands = [
  skill("review", "/skills/review/SKILL.md"),
  skill("plan", "/skills/plan/SKILL.md"),
  skill("broken", "/skills/broken/SKILL.md")
];
const files = new Map([
  ["/skills/review/SKILL.md", "---\nname: review\n---\n\nReview body.\n"],
  ["/skills/plan/SKILL.md", "---\nname: plan\n---\nPlan body."]
]);

const readFile = async (path: string) => {
  const content = files.get(path);
  if (content === undefined) throw new Error(`ENOENT: ${path}`);

  return content;
};

const reviewBlock =
  '<skill name="review" location="/skills/review/SKILL.md">\nReferences are relative to /skills/review.\n\nReview body.\n</skill>';
const planBlock =
  '<skill name="plan" location="/skills/plan/SKILL.md">\nReferences are relative to /skills/plan.\n\nPlan body.\n</skill>';

it.each([
  {
    case: "removes an exact suffix that skips duplicate, glued, unknown, unreadable, and native-skill chips",
    text: `/skill:plan use $plan, $review $missing $broken $review $plan\n\n${reviewBlock}`,
    expected: "/skill:plan use $plan, $review $missing $broken $review $plan"
  },
  {
    case: "keeps a user block that looks like a skill block before the exact suffix",
    text: `Use $plan $review\n\n${reviewBlock}\n\n${planBlock}\n\n${reviewBlock}`,
    expected: `Use $plan $review\n\n${reviewBlock}`
  },
  {
    case: "keeps a block whose body differs from the skill file",
    text: `Use $review\n\n${reviewBlock.replace("Review body.", "Edited body.")}`,
    expected: `Use $review\n\n${reviewBlock.replace("Review body.", "Edited body.")}`
  },
  {
    case: "keeps blocks in a different order from the chips",
    text: `Use $plan $review\n\n${reviewBlock}\n\n${planBlock}`,
    expected: `Use $plan $review\n\n${reviewBlock}\n\n${planBlock}`
  },
  {
    case: "keeps text after the suffix",
    text: `Use $review\n\n${reviewBlock}\n`,
    expected: `Use $review\n\n${reviewBlock}\n`
  }
])("$case", async ({ text, expected }) => {
  expect(await removeT3SkillSuffix(text, commands, readFile)).toBe(expected);
});
