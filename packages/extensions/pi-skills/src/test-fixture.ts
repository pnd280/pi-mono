import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";

export function command(
  name: string,
  source: SlashCommandInfo["source"] = "skill",
  path = `/skills/${name}/SKILL.md`
): SlashCommandInfo {
  return {
    name,
    source,
    description: "Shared description",
    sourceInfo: { path, source: "fixture", scope: "temporary", origin: "top-level" }
  };
}
