import path from "node:path";

import { expandHomePath } from "@pi-mono/utils/paths";

import { shellCommands, type Command, type Word } from "./shell-words.ts";

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
  paths: Word[];
  globs: Word[];
  reads: boolean;
  expression: boolean;
  filesOnly: boolean;
}

function applyOption(spec: CommandSpec, key: string, value: Word | undefined, found: Operands) {
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
  words: Word[],
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
      ? { value: attached, pattern: word.pattern, expandHome: false }
      : words[++index];
    if (!value) return undefined;
    applyOption(spec, key, value, found);
    break;
  }

  return index;
}

function operands(spec: CommandSpec, words: Word[]): Operands | undefined {
  const found: Operands = {
    paths: [],
    globs: [],
    reads: spec.reads,
    expression: false,
    filesOnly: false
  };
  const positional: Word[] = [];
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

function cdTarget(command: Command, previous?: Command): Word | undefined {
  const args = command.words.slice(1);
  if (args[0]?.value === "--") args.shift();
  const target = args[0];
  if (!target || args.length !== 1 || target.value.startsWith("-") || target.pattern)
    return undefined;
  if (command.separator === "|" || previous?.separator === "|") return undefined;

  return target;
}

function commandHints(name: string, command: Command, cwd: string): PathHint[] {
  const hints: PathHint[] = [];
  const args = command.words.slice(1);
  const spec = Object.hasOwn(commands, name) ? commands[name] : undefined;

  if (name === "find") {
    while (["-H", "-L", "-P"].includes(args[0]?.value ?? "")) args.shift();

    for (const arg of args) {
      if (arg.value.startsWith("-") || arg.value === "!") break;
      hints.push({ ...arg, cwd, kind: "directory", read: false });
    }
  } else if (spec) {
    const found = operands(spec, args);
    if (!found) return [];
    for (const word of found.paths) hints.push({ ...word, cwd, kind: "auto", read: found.reads });
    for (const word of found.globs) hints.push({ ...word, cwd, kind: "auto", read: found.reads });

    if (found.reads) {
      for (const word of command.inputs) hints.push({ ...word, cwd, kind: "file", read: true });
    }
  }

  return hints;
}

export function bashHints(source: string, cwd: string, home: string): PathHint[] {
  const hints: PathHint[] = [];
  let base = cwd;
  const parsed = shellCommands(source);

  for (const [index, command] of parsed.entries()) {
    const first = command.words[0];
    if (!first) continue;
    const name = path.basename(first.value);
    if (["source", ".", "eval", "pushd", "popd", "exec"].includes(name)) break;
    if (name === "cd") {
      const target = cdTarget(command, parsed[index - 1]);
      if (!target) break;
      base = path.resolve(
        base,
        target.expandHome ? expandHomePath(target.value, home) : target.value
      );
      hints.push({ value: base, cwd, kind: "directory", read: false, pattern: false });
    } else hints.push(...commandHints(name, command, base));
    // The second branch may run in a different directory. Do not guess.
    if (command.separator === "||") break;
  }

  return hints;
}
