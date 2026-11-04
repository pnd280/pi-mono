import { dirname } from "node:path";

import { stripFrontmatter, type SlashCommandInfo } from "@earendil-works/pi-coding-agent";

/** T3 Code joins its skill blocks to the prompt and to each other with this separator. */
const blockStart = '\n\n<skill name="';

type ReadSkillBody = (path: string) => Promise<string | undefined>;

/**
 * Rebuilds the text that T3 Code's `input` hook appends to `prompt`, with the same token order,
 * deduplication, native-skill exclusion, unknown-name skips, and unreadable-file skips.
 */
async function t3SkillSuffix(
  prompt: string,
  commands: SlashCommandInfo[],
  readBody: ReadSkillBody
): Promise<string | undefined> {
  const nativeSkill = /^\/skill:([^ ]+)(?: |$)/u.exec(prompt)?.[1];
  const seen = new Set<string>(nativeSkill === undefined ? [] : [nativeSkill]);
  const blocks: string[] = [];

  for (const match of prompt.matchAll(/(^|\s)\$(\S+)(?=\s|$)/gu)) {
    const name = match[2];
    if (name === undefined || seen.has(name)) continue;

    const command = commands.find(
      (candidate) => candidate.source === "skill" && candidate.name === `skill:${name}`
    );
    if (command === undefined) continue;

    seen.add(name);
    const path = command.sourceInfo.path;
    const body = await readBody(path);
    if (body === undefined) continue;

    blocks.push(
      `<skill name="${name}" location="${path}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`
    );
  }

  return blocks.length === 0 ? undefined : `\n\n${blocks.join("\n\n")}`;
}

/**
 * Removes the skill blocks that T3 Code's `input` hook appended, only when the end of `text` is
 * exactly what that hook builds from the text before it. Otherwise returns `text` unchanged.
 *
 * Each `\n\n<skill name="` position is a candidate boundary, tried from the last to the first.
 * A later position can't match, because the text before it holds every chip of the real prompt and
 * so rebuilds at least the whole real suffix. The first match is therefore the real boundary, and
 * user text that resembles a block before it stays.
 */
export async function removeT3SkillSuffix(
  text: string,
  commands: SlashCommandInfo[],
  readFile: (path: string) => Promise<string>
): Promise<string> {
  if (!text.includes(blockStart)) return text;

  const bodies = new Map<string, Promise<string | undefined>>();

  const readBody: ReadSkillBody = (path) => {
    let body = bodies.get(path);

    if (body === undefined) {
      // T3 Code skips the block when the read or the frontmatter parse throws.
      body = readFile(path)
        .then((content) => stripFrontmatter(content).trim())
        .catch(() => undefined);
      bodies.set(path, body);
    }

    return body;
  };

  for (let at = text.lastIndexOf(blockStart); at > 0; at = text.lastIndexOf(blockStart, at - 1)) {
    const prompt = text.slice(0, at);
    if ((await t3SkillSuffix(prompt, commands, readBody)) === text.slice(at)) return prompt;
  }

  return text;
}
