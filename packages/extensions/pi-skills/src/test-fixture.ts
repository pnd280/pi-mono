import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];

export function command(
  name: string,
  source: Command["source"] = "skill",
  path = `/skills/${name}/SKILL.md`
): Command {
  return {
    name,
    source,
    description: "Shared description",
    sourceInfo: { path, source: "fixture", scope: "temporary", origin: "top-level" }
  };
}
