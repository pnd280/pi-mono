import { z } from "zod";

/** An `expansionFormat` setting: at most 512 Unicode code points, with a `{path}` placeholder. */
export const skillReferenceFormatSchema = z.string().max(512).includes("{path}");

// Angle brackets keep paths with spaces or parentheses inside the Markdown link destination.
export const defaultSkillReferenceFormat = "[{command}](<{path}>)";

/** The fields of Pi's `SlashCommandInfo` that skill references use. */
export interface SkillCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo: { readonly path: string };
}

export interface SkillReferenceCatalog {
  /** Registered skill file paths, keyed by the full `/skill:<name>` command. */
  readonly skills: ReadonlyMap<string, string>;
  /** Registered prompt-template names, without the slash. */
  readonly templates: ReadonlySet<string>;
}

/** Projects Pi's registered commands onto the skills and prompt templates that references use. */
export function skillReferenceCatalog(
  commands: readonly SkillCommandInfo[]
): SkillReferenceCatalog {
  return {
    skills: new Map(
      commands
        .filter((command) => command.source === "skill")
        .map((command) => [`/${command.name}`, command.sourceInfo.path])
    ),
    templates: new Set(
      commands.filter((command) => command.source === "prompt").map((command) => command.name)
    )
  };
}

/** Replaces every `{command}` and `{path}` placeholder; all other text stays literal. */
export function formatSkillReference(format: string, command: string, path: string): string {
  return format.replace(/\{(command|path)\}/gu, (_placeholder, key: string) =>
    key === "command" ? command : path
  );
}

/**
 * Replaces each whitespace-separated token that `resolve` maps to a registered `/skill:<name>`
 * command with its formatted reference. Complete references already in `format` stay unchanged.
 * A leading reference that Pi would run as a skill or prompt-template command gets a leading space.
 */
export function expandSkillReferences(
  text: string,
  catalog: SkillReferenceCatalog,
  format: string,
  resolve: (token: string) => string | undefined
): string {
  if (catalog.skills.size === 0) return text;

  const references = new Map<string, string[]>();

  for (const [command, path] of catalog.skills) {
    const reference = formatSkillReference(format, command, path).trimStart();
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

  // A reference that ends in a placeholder could be the prefix of a longer path or command.
  const endsInPlaceholder = /\{(?:command|path)\}$/u.test(format);

  const complete = (reference: string, start: number) => {
    const next = text[start + reference.length];

    return (
      text.startsWith(reference, start) &&
      (next === undefined || /\s/u.test(next) || !endsInPlaceholder)
    );
  };

  const expanded = text.replace(/\S+/gu, (token, start: number) => {
    if (start < expansion.existingReferenceEnd) return token;

    const existing = references.get(token)?.find((reference) => complete(reference, start));

    if (existing !== undefined) {
      // A path or template can contain whitespace and skill-shaped tokens; skip the whole reference.
      expansion.existingReferenceEnd = start + existing.length;
      if (start === 0) expansion.startsWithReference = true;

      return token;
    }

    const command = resolve(token);
    const path = command === undefined ? undefined : catalog.skills.get(command);
    if (command === undefined || path === undefined) return token;
    if (start === 0) expansion.startsWithReference = true;

    return formatSkillReference(format, command, path);
  });

  if (!expansion.startsWithReference) return expanded;

  const leadingCommand = expanded.match(/^\/skill:[^ ]+/u)?.[0];
  const leadingTemplate = expanded.match(/^\/(\S+)/u)?.[1];

  // Pi expands skills at a literal space and templates at any whitespace after input handlers run.
  // Only guard commands introduced by a reference; keep ordinary skill and template calls working.
  return (leadingCommand !== undefined && catalog.skills.has(leadingCommand)) ||
    (leadingTemplate !== undefined && catalog.templates.has(leadingTemplate))
    ? ` ${expanded}`
    : expanded;
}
