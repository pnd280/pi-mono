import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Commands = ReturnType<ExtensionAPI["getCommands"]>;

export function getSkillPaths(commands: Commands): Map<string, string> {
  return new Map(
    commands
      .filter((command) => command.source === "skill")
      .map((command) => [`/${command.name}`, command.sourceInfo.path])
  );
}

export function getCompletableSkillNames(commands: Commands): Set<string> {
  const collisions = new Set(
    commands.filter((command) => command.source !== "skill").map((command) => command.name)
  );

  // Native items have no provenance. Even identical descriptions cannot disambiguate them.
  return new Set(
    commands
      .filter((command) => command.source === "skill" && !collisions.has(command.name))
      .map((command) => command.name)
  );
}
