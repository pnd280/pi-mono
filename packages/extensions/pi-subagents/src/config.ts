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
  launchArgsSchema,
  resolveLaunchPaths
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
const templateNameSchema = z.string().regex(TEMPLATE_NAME);
const templateSchema = z.strictObject({
  name: templateNameSchema,
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

/** The default launch values of a new task or a resume that names the template. */
export type Template = Omit<
  z.output<typeof templateSchema>,
  "name" | "launchArgs" | "appendSystemPrompts"
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

/**
 * Pi reads the value of these flags from the file of that name when one exists, relative to the child's working directory, the project.
 */
const PROMPT_FLAGS: ReadonlySet<string> = new Set(["--system-prompt", "--append-system-prompt"]);

/** A valid template and its name, or the reason why it is left out and its name when valid. */
type TemplateRead = { name: string; template: Template } | { name?: string; reason: string };

/**
 * Relative prompt paths, and relative local paths after `-e` and Pi's other path flags in `launchArgs`, resolve from the directory of `path`, the file that holds the template. The child would otherwise resolve them from its working directory, the project. For the same reason, `launchArgs` cannot hold Pi's system prompt flags.
 */
function readTemplate(value: unknown, path: string): TemplateRead {
  const parsed = templateSchema.safeParse(value);

  if (!parsed.success) {
    const name = z.object({ name: templateNameSchema }).safeParse(value).data?.name;
    const fields = parsed.error.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys" ? issue.keys : issue.path.slice(0, 1).map(String)
    );
    const reason = fields.length
      ? `invalid fields: ${[...new Set(fields)].join(", ")}`
      : "not an object";

    return { ...(name === undefined ? {} : { name }), reason };
  }

  const { name, launchArgs = [], appendSystemPrompts = [], ...values } = parsed.data;

  try {
    checkLaunchArgs(launchArgs, "launchArgs");
  } catch (error) {
    return { name, reason: error instanceof Error ? error.message : String(error) };
  }

  const promptFlag = launchArgs.find((arg) => PROMPT_FLAGS.has(arg));
  if (promptFlag !== undefined)
    return {
      name,
      reason: `launchArgs cannot contain ${promptFlag}: Pi can read its value as a file of the project; use appendSystemPrompts`
    };

  const prompts = appendSystemPrompts.map((entry) => settingsPath(entry, path));
  // Pi reads the file when the child starts; the check finds a wrong path at load.
  const unreadable = prompts.find((prompt) => readFile(prompt) === undefined);
  if (unreadable !== undefined) return { name, reason: `${unreadable} could not be read` };

  return {
    name,
    template: {
      ...values,
      launchArgs: resolveLaunchPaths(launchArgs, (entry) => settingsPath(entry, path)),
      appendSystemPrompts: prompts
    }
  };
}

/** A template file holds one template as plain JSON. */
function readTemplateFile(path: string): TemplateRead {
  const text = readFile(path);
  if (text === undefined) return { reason: "the file could not be read" };
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    // The error can hold file contents.
    return { reason: "the file is not valid JSON" };
  }

  return readTemplate(value, path);
}

/** Each entry is a template or the path of a template file. A later entry replaces an earlier one of the same name. */
function readTemplates(value: unknown, path: string, warnings: string[]): Map<string, Template> {
  const templates = new Map<string, Template>();
  const entries = z.array(z.unknown()).safeParse(value);

  if (!entries.success) {
    warnings.push(
      `ext.pi-subagents.templates in ${path} is invalid; expected an array of templates and template file paths`
    );

    return templates;
  }

  for (const [index, entry] of entries.data.entries()) {
    const file = typeof entry === "string" ? settingsPath(entry, path) : undefined;
    const source = file ?? `templates[${index}] in ${path}`;
    const read = file === undefined ? readTemplate(entry, path) : readTemplateFile(file);
    const label = read.name === undefined ? "template" : `template ${read.name}`;

    if ("reason" in read) {
      warnings.push(`${label} from ${source} is left out: ${read.reason}`);
      continue;
    }

    if (templates.has(read.name))
      warnings.push(`${label} from ${source} replaces an earlier template of the same name`);
    templates.set(read.name, read.template);
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
 * Valid trusted-project values override global values. A project `docs` list replaces the global list; `docs` joins the readable files for the `subagent` description. A valid project template replaces the global template of the same name.
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
