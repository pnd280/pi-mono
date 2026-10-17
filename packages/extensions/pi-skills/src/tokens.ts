import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";

export const defaultExpansionFormat = "[{command}]({path})";

function getSkillPaths(commands: SlashCommandInfo[]): Map<string, string> {
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
  commands: SlashCommandInfo[],
  format = defaultExpansionFormat
): string {
  const paths = getSkillPaths(commands);
  if (paths.size === 0 || (!text.includes("/skill:") && !text.startsWith("/"))) return text;

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

  const expansion = { existingReferenceEnd: 0, startsWithReference: false };

  const expanded = text.replace(/\S+/gu, (token, start: number) => {
    if (start < expansion.existingReferenceEnd) return token;

    const existing = references.get(token)?.find((reference) => text.startsWith(reference, start));

    if (existing !== undefined) {
      // A path or template can contain whitespace and skill-shaped tokens; skip the whole reference.
      expansion.existingReferenceEnd = start + existing.length;
      if (start === 0) expansion.startsWithReference = true;

      return token;
    }

    const path = paths.get(token);
    if (path === undefined) return token;
    if (start === 0) expansion.startsWithReference = true;

    return formatReference(format, token, path);
  });

  const leadingCommand = expanded.match(/^\/skill:[^ ]+/u)?.[0];
  const leadingTemplate = expanded.match(/^\/(\S+)/u)?.[1];
  const invokesTemplate =
    expansion.startsWithReference &&
    commands.some((command) => command.source === "prompt" && command.name === leadingTemplate);

  // Pi expands skills at a literal space and templates at any whitespace after input handlers run.
  // Only guard template commands introduced by a reference; keep ordinary template calls working.
  return (leadingCommand && paths.has(leadingCommand)) || invokesTemplate
    ? ` ${expanded}`
    : expanded;
}
