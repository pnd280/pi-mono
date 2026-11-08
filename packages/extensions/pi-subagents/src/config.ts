import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  readScopedSections,
  readSettingsFile,
  type ScopedSection
} from "@pi-mono/libs/settings-file";
import { canonicalKeySchema } from "@pi-mono/libs/tui/keybindings";
import { expandHomePath } from "@pi-mono/utils/paths";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

import {
  checkLaunchArgs,
  LAUNCH_ARG_MAX_LENGTH,
  LAUNCH_ARGS_MAX_ITEMS,
  launchArgsSchema
} from "./tasks/tool-schema.ts";

const resultDeliverySchema = z.enum(["turn_end", "settle"]);

/** When a busy supervisor receives background results: after each turn, or after its final reply. */
export type ResultDelivery = z.output<typeof resultDeliverySchema>;

const sectionSchema = z.object({
  maxDepth: z.int().nonnegative().optional().catch(undefined),
  maxConcurrent: z.int().positive().optional().catch(undefined),
  maxQueued: z.int().nonnegative().optional().catch(undefined),
  jobs: z.boolean().optional().catch(undefined),
  resultDelivery: resultDeliverySchema.optional().catch(undefined),
  shortcut: canonicalKeySchema.optional().catch(undefined),
  docs: z.unknown().optional(),
  templates: z.unknown().optional()
});
const docsSchema = z.array(z.string().trim().min(1));
const TEMPLATE_NAME = /^[a-z][a-z0-9-]*$/;
const templateSchema = z.strictObject({
  description: z.string().trim().min(1),
  model: z.string().min(1).optional(),
  thinking: z.enum(MODEL_THINKING_LEVELS).optional(),
  background: z.boolean().optional(),
  launchArgs: launchArgsSchema.optional(),
  appendSystemPrompts: z
    .array(z.string().trim().min(1).max(LAUNCH_ARG_MAX_LENGTH))
    .max(LAUNCH_ARGS_MAX_ITEMS)
    .optional()
});

/** The default launch values of a new task that names the template. */
export type Template = Omit<
  z.output<typeof templateSchema>,
  "launchArgs" | "appendSystemPrompts"
> & {
  launchArgs: string[];
  /** Absolute paths. */
  appendSystemPrompts: string[];
};

export type SubagentsConfig = {
  maxDepth: number;
  maxConcurrent: number;
  maxQueued: number;
  /** Registers the `job` and `job_abort` tools. */
  jobs: boolean;
  resultDelivery: ResultDelivery;
  /** Opens the task panel. */
  shortcut: string;
  /** Valid templates by name, global first. */
  templates: ReadonlyMap<string, Template>;
};

type ScopeSettings = Omit<z.output<typeof sectionSchema>, "docs" | "templates"> & {
  /** Absolute paths; absent when the scope sets no valid list. */
  docPaths?: string[];
  templates: Map<string, Template>;
  warnings: string[];
};

/** The text of a settings-owned file, or `undefined` when it cannot be read. */
function readFile(path: string): string | undefined {
  try {
    return readSettingsFile(path);
  } catch {
    // The caller reports the path without the error, which can hold file contents.
    return undefined;
  }
}

/** Relative paths belong to the settings file that names them. */
function settingsPath(entry: string, settings: string): string {
  return resolve(dirname(settings), expandHomePath(entry, homedir()));
}

/** A valid template, or the reason why it is left out. */
function readTemplate(name: string, value: unknown, path: string): Template | string {
  if (!TEMPLATE_NAME.test(name)) return `its name does not match ${TEMPLATE_NAME.source}`;
  const parsed = templateSchema.safeParse(value);

  if (!parsed.success) {
    const fields = parsed.error.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys" ? issue.keys : issue.path.slice(0, 1).map(String)
    );

    return fields.length ? `invalid fields: ${[...new Set(fields)].join(", ")}` : "not an object";
  }

  const { launchArgs = [], appendSystemPrompts = [], ...values } = parsed.data;

  try {
    checkLaunchArgs(launchArgs, "launchArgs");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const prompts = appendSystemPrompts.map((entry) => settingsPath(entry, path));
  // Pi reads the file when the child starts; the check finds a wrong path at load.
  const unreadable = prompts.find((prompt) => readFile(prompt) === undefined);
  if (unreadable !== undefined) return `${unreadable} could not be read`;

  return { ...values, launchArgs, appendSystemPrompts: prompts };
}

function readTemplates(value: unknown, path: string, warnings: string[]): Map<string, Template> {
  const templates = new Map<string, Template>();
  const entries = z.record(z.string(), z.unknown()).safeParse(value);

  if (!entries.success) {
    warnings.push(
      `ext.pi-subagents.templates in ${path} is invalid; expected an object of templates`
    );

    return templates;
  }

  for (const [name, entry] of Object.entries(entries.data)) {
    const template = readTemplate(name, entry, path);
    if (typeof template === "string")
      warnings.push(`template ${name} in ${path} is left out: ${template}`);
    else templates.set(name, template);
  }

  return templates;
}

const unset = (): ScopeSettings => ({ templates: new Map(), warnings: [] });

function readSection(section: ScopedSection): ScopeSettings {
  if (section.status === "unreadable") return unset();
  const { path } = section;
  const { docs, templates, ...limits } = sectionSchema.safeParse(section.value).data ?? {};
  const warnings: string[] = [];
  const paths = docs === undefined ? undefined : docsSchema.safeParse(docs);
  if (paths?.success === false)
    warnings.push(`ext.pi-subagents.docs in ${path} is invalid; expected an array of file paths`);

  return {
    ...limits,
    ...(paths?.success ? { docPaths: paths.data.map((entry) => settingsPath(entry, path)) } : {}),
    templates:
      templates === undefined
        ? new Map<string, Template>()
        : readTemplates(templates, path, warnings),
    warnings
  };
}

/** Joins the readable `docs` files, and adds a warning for each file that cannot be read. */
function readDocs(paths: readonly string[], warnings: string[]): string {
  const docs: string[] = [];

  for (const path of paths) {
    const text = readFile(path);
    if (text === undefined) warnings.push(`${path} could not be read; its docs are left out`);
    else if (text.trim()) docs.push(text.trim());
  }

  return docs.join("\n\n");
}

/**
 * Valid trusted-project values override global values. A project `docs` list replaces the
 * global list; `docs` joins the readable files for the `subagent` description. A valid project
 * template replaces the global template of the same name.
 */
export function loadConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): SubagentsConfig & { docs: string; warnings: string[] } {
  const [global = unset(), project = unset()] = readScopedSections(
    { cwd, projectTrusted, agentDir },
    "ext.pi-subagents"
  ).map(readSection);
  const warnings = [...global.warnings, ...project.warnings];
  const docs = readDocs(project.docPaths ?? global.docPaths ?? [], warnings);

  return {
    maxDepth: project.maxDepth ?? global.maxDepth ?? 2,
    maxConcurrent: project.maxConcurrent ?? global.maxConcurrent ?? 8,
    maxQueued: project.maxQueued ?? global.maxQueued ?? 8,
    jobs: project.jobs ?? global.jobs ?? false,
    resultDelivery: project.resultDelivery ?? global.resultDelivery ?? "turn_end",
    shortcut: project.shortcut ?? global.shortcut ?? "ctrl+alt+s",
    templates: new Map([...global.templates, ...project.templates]),
    docs,
    warnings
  };
}
