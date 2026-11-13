import { readFile } from "node:fs/promises";

import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { joinInputChain } from "@pi-mono/libs/input-chain";
import {
  defaultSkillReferenceFormat,
  expandSkillReferences,
  skillReferenceCatalog
} from "@pi-mono/utils/skill-reference";

import { loadExpansionFormat } from "./config.ts";
import { removeT3SkillSuffix } from "./t3-suffix.ts";

/** T3 Code sets this only when it loads its own extension, which holds the skill-chip hook. */
const T3_EXTENSION_ENV = "T3_PI_MCP_EXTENSION_PATH";

/**
 * Runs before every transform that changes text, now pi-skills at rank 100, so T3's blocks are still exact. The gap keeps ranks 91-99 free for transforms that need the prompt without them.
 */
const SUFFIX_RANK = 90;

/** Runs after pi-skills (rank 100), so pi-skills never expands the references in this output. */
const CHIP_RANK = 110;

/**
 * T3 Code's server reads a skill chip as a whole whitespace-separated `$<name>` token. The shared expansion keeps only tokens whose `/skill:<name>` command is registered.
 */
function chipCommand(token: string): string | undefined {
  return token.startsWith("$") ? `/skill:${token.slice(1)}` : undefined;
}

/** Replaces each registered `$<name>` chip with its formatted skill reference. */
function rewriteSkillChips(text: string, commands: SlashCommandInfo[], format: string): string {
  return expandSkillReferences(text, skillReferenceCatalog(commands), format, chipCommand);
}

export default function t3Skills(pi: ExtensionAPI): void {
  if (!process.env[T3_EXTENSION_ENV]) return;

  const input = joinInputChain(pi, { id: "pi-t3-skills" });
  let format = defaultSkillReferenceFormat;

  // When the chain runs after T3's hook, its exact blocks go. When any chain participant loads before T3's extension, T3's hook sees the rewritten references instead and adds blocks only for `$<name>` tokens inside a registered path or the format (docs/rules.md#skill-blocks).
  input.transform(SUFFIX_RANK, async (event) => {
    const text = await removeT3SkillSuffix(event.text, pi.getCommands(), (path) =>
      readFile(path, "utf8")
    );

    return text === event.text ? undefined : { action: "transform", text };
  });

  input.transform(CHIP_RANK, (event) => {
    const text = rewriteSkillChips(event.text, pi.getCommands(), format);

    return text === event.text ? undefined : { action: "transform", text };
  });

  pi.on("session_start", (_event, ctx) => {
    format = loadExpansionFormat(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
  });
}
