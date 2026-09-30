import path from "node:path";

import { expandHomePath } from "@pi-mono/utils/paths";
import { hasGlob } from "@pi-mono/utils/search-scopes";
import { parse, type Command, type Node, type Word, type WordPart } from "unbash";

export interface PathHint {
  value: string;
  cwd: string;
  kind: "file" | "directory" | "auto";
  read: boolean;
  pattern: boolean;
  expandHome?: boolean;
}

interface CommandSpec {
  /** Options that consume a value. */
  values?: readonly string[];
  flags?: readonly string[];
  /** Options whose value is an inline program; the first positional is then a path. */
  scripts?: readonly string[];
  /** Options whose value is a program file path. */
  scriptFiles?: readonly string[];
  /** Options whose positive values are path patterns. */
  globs?: readonly string[];
  /** Filename-only output modes, which do not read content into the result. */
  listing?: readonly string[];
  /** Options that make every positional a path. */
  filesOnly?: readonly string[];
  /** The first positional is a pattern or program, not a path. */
  patternFirst?: boolean;
  /** Accepts obsolete `-NUM` counts, such as `head -20`. */
  counts?: boolean;
  /** Whether operands are content reads unless a listing option applies. */
  reads: boolean;
}

const names = (list: string): readonly string[] => list.split(" ");
const programOptions = { scripts: names("e regexp expression"), scriptFiles: names("f file") };

// Unknown options discard that command instead of treating option values as paths.
const commands: Record<string, CommandSpec> = {
  cat: {
    flags: names(
      "A b e E n s t T u v show-all number number-nonblank squeeze-blank show-ends show-tabs show-nonprinting"
    ),
    reads: true
  },
  head: {
    values: names("n c lines bytes"),
    flags: names("q v z quiet silent verbose zero-terminated"),
    counts: true,
    reads: true
  },
  tail: {
    values: names("n c lines bytes sleep-interval max-unchanged-stats pid"),
    flags: names("f F q v z follow quiet silent verbose retry zero-terminated"),
    counts: true,
    reads: true
  },
  ls: {
    // GNU `--color[=WHEN]` takes its value only when attached, so it is a flag here.
    values: names("I ignore hide format sort time quoting-style block-size width tabsize"),
    flags: names(
      "a A l h R d t r S s F p 1 n i L H all almost-all recursive directory human-readable color"
    ),
    reads: false
  },
  grep: {
    ...programOptions,
    values: names(
      "A B C m context after-context before-context max-count include exclude exclude-dir binary-files directories devices"
    ),
    flags: names(
      "n i v r R E F P w x o h H l L c q s a I z Z line-number ignore-case invert-match recursive extended-regexp fixed-strings perl-regexp word-regexp only-matching with-filename no-filename files-with-matches files-without-match count quiet color colour"
    ),
    listing: names("l L c q files-with-matches files-without-match count quiet"),
    patternFirst: true,
    reads: true
  },
  rg: {
    ...programOptions,
    values: names(
      "A B C m g t T j context after-context before-context max-count glob iglob type type-not threads max-depth encoding color sort sortr max-columns max-filesize"
    ),
    flags: names(
      "n i v F P w x o l L c q s a z u hidden no-ignore no-ignore-vcs files files-with-matches files-without-match count count-matches quiet line-number no-line-number ignore-case smart-case fixed-strings only-matching follow multiline json no-heading heading with-filename no-filename text pcre2"
    ),
    globs: names("g glob iglob"),
    listing: names("files l c q files-with-matches files-without-match count count-matches quiet"),
    filesOnly: names("files"),
    patternFirst: true,
    reads: true
  },
  fd: {
    values: names("t e E d j type extension exclude max-depth min-depth threads color"),
    flags: names(
      "H I L a s i g F l 0 hidden no-ignore follow absolute-path case-sensitive ignore-case glob fixed-strings full-path print0"
    ),
    patternFirst: true,
    reads: false
  },
  sed: {
    ...programOptions,
    flags: names("n E r s u z quiet silent regexp-extended separate unbuffered null-data"),
    patternFirst: true,
    reads: true
  },
  awk: { ...programOptions, values: names("v F"), patternFirst: true, reads: true }
};

function supportedPart(part: WordPart): boolean {
  switch (part.type) {
    case "Literal":
    case "SingleQuoted":
      return true;
    case "DoubleQuoted":
      return part.parts.every((child) => child.type === "Literal");
    case "BraceExpansion":
      // Scope alternatives do not interpret shell quotes or escapes inside braces.
      return (
        !part.text.includes("\\") &&
        (part.parts?.every(
          (child) =>
            child.type === "Literal" || (child.type === "BraceExpansion" && supportedPart(child))
        ) ??
          true)
      );
    default:
      return false;
  }
}

function supportedCommand(command: Command): boolean {
  // Word parts are lazy. Inspect them even in ignored arguments and redirect destinations.
  return (
    command.prefix.length === 0 &&
    [command.name, ...command.suffix, ...command.redirects.map(({ target }) => target)].every(
      (word) => {
        if (!word) return true;
        if (!(word.parts?.every(supportedPart) ?? true)) return false;
        if (!wordPattern(word)) return true;

        // A dequoted scope pattern cannot distinguish literal and active metacharacters.
        return (
          !word.text.match(/\\[\s\S]/g)?.some(hasGlob) &&
          !word.parts?.some(
            (part) =>
              (part.type === "SingleQuoted" && hasGlob(part.value)) ||
              (part.type === "DoubleQuoted" &&
                part.parts.some((child) => child.type === "Literal" && hasGlob(child.value)))
          )
        );
      }
    ) &&
    command.redirects.every(
      (redirect) =>
        redirect.variableName === undefined &&
        ["<", ">", ">>", "<&", ">&"].includes(redirect.operator) &&
        redirect.target !== undefined
    )
  );
}

function unescapedGlob(text: string): boolean {
  return hasGlob(text.replace(/\\[\s\S]/g, ""));
}

function wordPattern(word: Word): boolean {
  return word.parts
    ? word.parts.some(
        (part) =>
          part.type === "BraceExpansion" || (part.type === "Literal" && unescapedGlob(part.text))
      )
    : unescapedGlob(word.text);
}

function wordHint(word: Word, cwd: string): PathHint {
  return {
    value: word.value,
    cwd,
    kind: "auto",
    read: false,
    pattern: wordPattern(word),
    expandHome: word.text.replace(/\\\n/g, "").startsWith("~")
  };
}

function optionKind(
  spec: CommandSpec,
  key: string
): "script" | "script-file" | "value" | "flag" | undefined {
  if (spec.scriptFiles?.includes(key)) return "script-file";
  if (spec.scripts?.includes(key)) return "script";
  if (spec.values?.includes(key)) return "value";
  if (spec.flags?.includes(key)) return "flag";

  return undefined;
}

interface Operands {
  paths: PathHint[];
  globs: PathHint[];
  reads: boolean;
  expression: boolean;
  filesOnly: boolean;
}

function applyOption(spec: CommandSpec, key: string, value: PathHint | undefined, found: Operands) {
  if (spec.filesOnly?.includes(key)) found.filesOnly = true;
  if (spec.listing?.includes(key)) found.reads = false;
  const kind = optionKind(spec, key);
  if (kind === "script" || kind === "script-file") found.expression = true;
  if (kind === "script-file" && value) found.paths.push(value);
  if (spec.globs?.includes(key) && value && !value.value.startsWith("!"))
    found.globs.push({ ...value, pattern: true });
}

function parseOptions(
  spec: CommandSpec,
  words: PathHint[],
  index: number,
  found: Operands
): number | undefined {
  const word = words[index];
  if (!word) return undefined;
  const long = word.value.startsWith("--");
  const raw = word.value.slice(long ? 2 : 1);
  const keys = long ? [raw.split("=", 1)[0] ?? ""] : raw.split("");

  for (const [position, key] of keys.entries()) {
    const kind = optionKind(spec, key);
    if (!kind) return undefined;

    if (kind === "flag") {
      applyOption(spec, key, undefined, found);
      continue;
    }

    const attached = long ? raw.slice(key.length + 1) : keys.slice(position + 1).join("");
    const value = (long ? raw.includes("=") : attached !== "")
      ? { ...word, value: attached, expandHome: false }
      : words[++index];
    if (!value) return undefined;
    applyOption(spec, key, value, found);
    break;
  }

  return index;
}

function operands(spec: CommandSpec, words: PathHint[]): Operands | undefined {
  const found: Operands = {
    paths: [],
    globs: [],
    reads: spec.reads,
    expression: false,
    filesOnly: false
  };
  const positional: PathHint[] = [];
  let options = true;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;

    if (word.value === "--" && options) {
      options = false;
      continue;
    }

    if (!options || !word.value.startsWith("-") || word.value === "-") {
      positional.push(word);
      continue;
    }

    if (spec.counts && /^-\d+$/.test(word.value)) continue;

    const consumed = parseOptions(spec, words, i, found);
    if (consumed === undefined) return undefined;
    i = consumed;
  }

  if (spec.patternFirst && !found.expression && !found.filesOnly) positional.shift();
  found.paths.push(...positional.filter(({ value }) => value !== "-"));

  return found;
}

function commandHints(name: string, command: Command, cwd: string): PathHint[] {
  const hints: PathHint[] = [];
  const args = command.suffix.map((word) => wordHint(word, cwd));
  const spec = Object.hasOwn(commands, name) ? commands[name] : undefined;

  if (name === "find") {
    while (["-H", "-L", "-P"].includes(args[0]?.value ?? "")) args.shift();

    for (const arg of args) {
      if (arg.value.startsWith("-") || arg.value === "!") break;
      hints.push({ ...arg, kind: "directory" });
    }
  } else if (spec) {
    const found = operands(spec, args);
    if (!found) return [];
    for (const hint of [...found.paths, ...found.globs]) hints.push({ ...hint, read: found.reads });

    if (found.reads) {
      for (const redirect of command.redirects) {
        if (redirect.operator === "<" && (redirect.fileDescriptor ?? 0) === 0 && redirect.target)
          hints.push({ ...wordHint(redirect.target, cwd), kind: "file", read: true });
      }
    }
  }

  return hints;
}

export function bashHints(source: string, cwd: string, home: string): PathHint[] {
  const script = parse(source);
  if ((script.errors?.length ?? 0) > 0) return [];
  const hints: PathHint[] = [];
  let base = cwd;
  let stopped = false;

  function infer(command: Command, name: string, piped: boolean): boolean {
    if (["source", ".", "eval", "pushd", "popd", "exec"].includes(name)) return false;
    if (name === "cd") {
      const args = command.suffix.map((word) => wordHint(word, base));
      if (args[0]?.value === "--") args.shift();
      const target = args[0];
      if (piped || !target || args.length !== 1 || target.value.startsWith("-") || target.pattern)
        return false;
      base = path.resolve(
        base,
        target.expandHome ? expandHomePath(target.value, home) : target.value
      );
      hints.push({ value: base, cwd, kind: "directory", read: false, pattern: false });
    } else hints.push(...commandHints(name, command, base));

    return true;
  }

  function visit(node: Node, separator = "", piped = false): boolean {
    switch (node.type) {
      case "Statement":
        return (
          !node.background && node.redirects.length === 0 && visit(node.command, separator, piped)
        );
      case "Pipeline":
      case "AndOr":
        if (
          node.type === "Pipeline" &&
          (node.negated || node.time || node.operators.includes("|&"))
        )
          return false;

        return node.commands.every((child, index) =>
          visit(child, node.operators[index] ?? separator, piped || node.type === "Pipeline")
        );
      case "Command":
        if (!supportedCommand(node)) return false;

        // Keep validating after inference stops, so later unsupported syntax discards all hints.
        if (!stopped) {
          if (node.name) stopped = !infer(node, path.basename(node.name.value), piped);
          stopped ||= separator === "||";
        }

        return true;
      default:
        return false;
    }
  }

  return script.commands.every((statement) => visit(statement)) ? hints : [];
}
