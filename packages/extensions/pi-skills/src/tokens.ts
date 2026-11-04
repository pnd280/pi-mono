import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import {
  defaultSkillReferenceFormat,
  expandSkillReferences,
  skillReferenceCatalog
} from "@pi-mono/utils/skill-reference";

/** Expands standalone registered `/skill:<name>` tokens; each token is its own command. */
export function expandSkillInput(
  text: string,
  commands: SlashCommandInfo[],
  format = defaultSkillReferenceFormat
): string {
  // Existing references can start with a template command and still need the leading guard.
  if (!text.includes("/skill:") && !text.startsWith("/")) return text;

  return expandSkillReferences(text, skillReferenceCatalog(commands), format, (token) => token);
}
