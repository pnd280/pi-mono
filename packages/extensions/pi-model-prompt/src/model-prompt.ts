import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

const SETTINGS_KEY = "ext.pi-model-prompt";
const BASE_FILE = "APPEND_SYSTEM.md";

/** Pi joins multiple append sources with the same separator. */
const SEPARATOR = "\n\n";

const MAX_RULES = 100;
const MAX_PATTERN_LENGTH = 512;
const MAX_FILES_PER_RULE = 32;
const MAX_PATH_LENGTH = 4096;

const ruleSchema = z.strictObject({
  match: z.string().min(1).max(MAX_PATTERN_LENGTH),
  append: z.array(z.string().min(1).max(MAX_PATH_LENGTH)).max(MAX_FILES_PER_RULE).optional()
});

const sectionSchema = z.strictObject({
  rules: z.array(z.unknown()).max(MAX_RULES).optional()
});

interface ModelRule {
  pattern: RegExp;
  /** Absolute file paths, in append order. */
  append: readonly string[] | undefined;
}

interface ModelPromptConfig {
  rules: ModelRule[];
  warnings: string[];
}

export interface ModelPromptSnapshot {
  readonly warnings: readonly string[];
  /**
   * Matches `modelKey` as `provider/id` and returns the selected append list joined in order,
   * only when the current text equals the discovered base and every listed file was read.
   * Differing explicit text is protected.
   * `undefined` means no change; an empty string removes the append text.
   */
  replacementFor(modelKey: string, currentAppend: string): string | undefined;
}

/**
 * Loads global settings, the base, and every configured file once for this session. Base
 * discovery mirrors Pi: trusted project file, then agent file. Pass `projectDir` only for
 * trusted projects. Lookups use this snapshot without rereading settings or files.
 */
export function loadModelPromptSnapshot({
  projectDir,
  agentDir
}: {
  projectDir: string | undefined;
  agentDir: string;
}): ModelPromptSnapshot {
  const { rules, warnings } = loadModelPromptConfig(agentDir);
  const dirs = projectDir === undefined ? [agentDir] : [projectDir, agentDir];
  const basePath = dirs.map((dir) => join(dir, BASE_FILE)).find((path) => existsSync(path));
  // No base file means empty text; an unreadable base disables replacement.
  let base: string | undefined = "";

  if (basePath !== undefined) {
    try {
      base = readPrompt(basePath);
    } catch {
      base = undefined;
      warnings.push(`${basePath} could not be read; replacement disabled`);
    }
  }

  const files = new Map<string, string>();

  for (const path of new Set(rules.flatMap((rule) => rule.append ?? []))) {
    try {
      files.set(path, readPrompt(path));
    } catch {
      warnings.push(`${path} could not be read; rules listing it keep ${BASE_FILE}`);
    }
  }

  return {
    warnings,
    replacementFor(modelKey, currentAppend) {
      const paths = selectAppendFiles(rules, modelKey);
      if (paths === undefined || base === undefined || currentAppend !== base) return undefined;
      const parts: string[] = [];

      for (const path of paths) {
        const text = files.get(path);
        if (text === undefined) return undefined;
        parts.push(text);
      }

      const replacement = parts.join(SEPARATOR);

      return replacement === currentAppend ? undefined : replacement;
    }
  };
}

/**
 * Reads rules from the global settings file only; invalid rules are skipped with a warning.
 * `append` paths expand a leading `~`, then resolve relative to the settings file's directory.
 */
function loadModelPromptConfig(agentDir: string): ModelPromptConfig {
  const warnings: string[] = [];
  let record: Record<string, unknown>;

  try {
    record = readSettingsRecord(join(agentDir, "settings.json"));
  } catch {
    return { rules: [], warnings: ["settings.json could not be read; rules disabled"] };
  }

  const rawSection = record[SETTINGS_KEY];

  if (rawSection === undefined) return { rules: [], warnings };

  const section = sectionSchema.safeParse(rawSection);

  if (!section.success) {
    return {
      rules: [],
      warnings: [
        `${SETTINGS_KEY} is invalid; expected only rules (at most ${MAX_RULES}); rules disabled`
      ]
    };
  }

  const rules: ModelRule[] = [];
  const home = homedir();

  for (const [index, rawRule] of (section.data.rules ?? []).entries()) {
    const rule = ruleSchema.safeParse(rawRule);

    if (!rule.success) {
      warnings.push(
        `rules[${index}] skipped: invalid rule; check match, append, and unknown fields`
      );
      continue;
    }

    let pattern: RegExp;

    try {
      pattern = new RegExp(rule.data.match);
    } catch {
      warnings.push(`rules[${index}] skipped: invalid regular expression`);
      continue;
    }

    rules.push({
      pattern,
      append: rule.data.append?.map((path) => resolve(agentDir, expandHomePath(path, home)))
    });
  }

  return { rules, warnings };
}

/** The first matching rule that sets a field decides it; later rules may supply other fields. */
function selectAppendFiles(
  rules: readonly ModelRule[],
  modelKey: string
): readonly string[] | undefined {
  for (const rule of rules) {
    if (rule.append !== undefined && rule.pattern.test(modelKey)) return rule.append;
  }

  return undefined;
}

function readPrompt(path: string): string {
  // A FIFO at a configured path must not block session startup, even before the type check.
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    if (!fstatSync(descriptor).isFile()) throw new Error("Prompt must be a regular file.");
    const text = readFileSync(descriptor, "utf8");

    // Matches Pi's own loader so unchanged base text compares equal.
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } finally {
    closeSync(descriptor);
  }
}
