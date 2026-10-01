import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const defaultExpansionFormat = "[{command}]({path})";

function getSkillPaths(commands: ReturnType<ExtensionAPI["getCommands"]>): Map<string, string> {
  return new Map(
    commands
      .filter((command) => command.source === "skill")
      .map((command) => [`/${command.name}`, command.sourceInfo.path])
  );
}

function formatReference(format: string, command: string, path: string): string {
  return format.replace(/\{(command|path)\}/gu, (_placeholder, key: string) =>
    key === "command" ? command : path
  );
}

export function expandSkillInput(
  text: string,
  commands: ReturnType<ExtensionAPI["getCommands"]>,
  format = defaultExpansionFormat
): string {
  const paths = getSkillPaths(commands);
  if (paths.size === 0 || !text.includes("/skill:")) return text;

  const references = new Map<string, string[]>();

  for (const [command, path] of paths) {
    const reference = formatReference(format, command, path).trimStart();
    const firstToken = reference.match(/^\S+/u)?.[0];
    if (firstToken === undefined) continue;

    const candidates = references.get(firstToken) ?? [];

    candidates.push(reference);
    references.set(firstToken, candidates);
  }

  // One rendered reference may be a prefix of another; protect the longest first.
  for (const candidates of references.values())
    candidates.sort((left, right) => right.length - left.length);

  let endOfExistingReference = 0;

  const expanded = text.replace(/\S+/gu, (token, start: number) => {
    if (start < endOfExistingReference) return token;

    const existing = references.get(token)?.find((reference) => text.startsWith(reference, start));

    if (existing !== undefined) {
      // A path or template can contain whitespace and skill-shaped tokens; skip the whole reference.
      endOfExistingReference = start + existing.length;

      return token;
    }

    const path = paths.get(token);

    return path === undefined ? token : formatReference(format, token, path);
  });

  const leadingCommand = expanded.match(/^\/skill:[^ ]+/u)?.[0];

  // Pi parses the leading command up to the first literal space after input handlers run.
  return leadingCommand && paths.has(leadingCommand) ? ` ${expanded}` : expanded;
}
