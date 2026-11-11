import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { expandSkillReferences, skillReferenceCatalog } from "@pi-mono/utils/skill-reference";

/**
 * T3 Code's server reads a skill chip as a whole whitespace-separated `$<name>` token. The shared expansion keeps only tokens whose `/skill:<name>` command is registered.
 */
function chipCommand(token: string): string | undefined {
  return token.startsWith("$") ? `/skill:${token.slice(1)}` : undefined;
}

/** Replaces each registered `$<name>` chip with its formatted skill reference. */
export function rewriteSkillChips(
  text: string,
  commands: SlashCommandInfo[],
  format: string
): string {
  return expandSkillReferences(text, skillReferenceCatalog(commands), format, chipCommand);
}
