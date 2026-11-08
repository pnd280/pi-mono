import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

import { deliverySchema } from "../details.ts";

// The bounds of a call's launch arguments, a template's launch arguments, and a template's
// prompt files. Together they keep a run record well below `RECORD_MAX_BYTES`.
export const LAUNCH_ARGS_MAX_ITEMS = 32;

export const LAUNCH_ARG_MAX_LENGTH = 2048;

/** Pi CLI arguments for a child, in a call or a template. */
export const launchArgsSchema = z
  .array(z.string().max(LAUNCH_ARG_MAX_LENGTH))
  .max(LAUNCH_ARGS_MAX_ITEMS);

export const toolInputSchema = z.strictObject({
  delivery: deliverySchema
    .optional()
    .describe(
      "For input to an active task. follow_up (default) waits until the current work finishes; steer arrives before the next atomic action."
    ),
  background: z
    .boolean()
    .optional()
    .describe("Run independent work in the background. Its result arrives automatically."),
  description: z.string().min(1).describe("A short (3 to 5 words) label for the task."),
  prompt: z
    .string()
    .min(1)
    .describe(
      "The detailed task for the child to perform, or new input for an existing conversation."
    ),
  task_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The full ID of a task you own. Resume inactive tasks or send input to active tasks. Active-task updates return immediately."
    ),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "A provider/id model. Defaults to the task's previously requested model on resume, and otherwise to the template's model, then your current model."
    ),
  thinking: z
    .enum(MODEL_THINKING_LEVELS)
    .optional()
    .describe(
      "Defaults to the task's previously requested level on resume, and otherwise to the template's level, then your current level."
    ),
  launch_args: launchArgsSchema
    .optional()
    .describe(
      'Extra Pi CLI arguments for the child process, such as ["--no-extensions", "-e", "path"]. Defaults to the task\'s previous value on resume, where [] clears it. A template\'s arguments follow these.'
    ),
  template: z
    .string()
    .min(1)
    .optional()
    .describe("The name of a template from the list in this description.")
});

/** The `launch_args` flags that other parameters own; each fails the call before any side effect. */
const OWNED_FLAGS: ReadonlyMap<string, string> = new Map([
  ["--model", "model"],
  ["--provider", "model"],
  ["--thinking", "thinking"],
  ...[
    "--session",
    "--session-id",
    "--no-session",
    "--fork",
    "-c",
    "--continue",
    "-r",
    "--resume"
  ].map((flag): [string, string] => [flag, "task_id"])
]);

/**
 * Pi's flags that take the next argument whatever it is. Last in `launch_args`, one would take the
 * extension's `--mode`, and the child would wait on stdin instead of starting RPC. No other flag,
 * including those that extensions register, takes the `--mode` that follows the launch arguments.
 */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--api-key",
  "--system-prompt",
  "--append-system-prompt",
  "--name",
  "-n",
  "--session-dir",
  "--models",
  "--tools",
  "-t",
  "--exclude-tools",
  "-xt",
  "--export",
  "--extension",
  "-e",
  "--skill",
  "--prompt-template",
  "--theme"
]);

/**
 * Throws when a launch argument is a flag that another parameter owns, alone or as `flag=value`,
 * or when the last argument is a flag that needs a value. A value that equals such a flag also
 * fails. The messages name the arguments as `field`.
 */
export function checkLaunchArgs(args: readonly string[], field = "launch_args"): void {
  for (const arg of args) {
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const owner = OWNED_FLAGS.get(flag);
    if (owner) throw new Error(`${field} cannot contain ${flag}: use the ${owner} parameter`);
  }

  const last = args.at(-1);
  if (last !== undefined && VALUE_FLAGS.has(last))
    throw new Error(`${field} cannot end with ${last}: give it a value`);
}

/** Pi keeps all values of these flags; for the other value flags, the last value wins. */
const LIST_FLAGS: ReadonlySet<string> = new Set([
  "--extension",
  "-e",
  "--skill",
  "--prompt-template",
  "--theme",
  "--append-system-prompt"
]);

const FLAG_ALIASES: ReadonlyMap<string, string> = new Map([
  ["-t", "--tools"],
  ["-xt", "--exclude-tools"],
  ["-n", "--name"]
]);

/** The long name of a flag that takes one value, alone or as `flag=value`. */
function singleValueFlag(arg: string): string | undefined {
  const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
  const name = FLAG_ALIASES.get(flag) ?? flag;

  return VALUE_FLAGS.has(name) && !LIST_FLAGS.has(name) ? name : undefined;
}

/** The single-value flags that the arguments set. Pi reads the token after a value flag as its value. */
function singleValueFlags(args: readonly string[]): string[] {
  const flags: string[] = [];
  let isValue = false;

  for (const arg of args) {
    if (isValue) {
      isValue = false;
      continue;
    }

    const flag = singleValueFlag(arg);
    if (flag !== undefined) flags.push(flag);
    isValue = VALUE_FLAGS.has(arg);
  }

  return flags;
}

/**
 * Throws when a call's launch argument sets a single-value flag that the template's launch
 * arguments also set. The template's value would replace the call's value without notice.
 */
export function checkTemplateArgs(
  call: readonly string[],
  template: readonly string[],
  name: string
): void {
  const templateFlags = new Set(singleValueFlags(template));

  for (const flag of singleValueFlags(call)) {
    if (templateFlags.has(flag))
      throw new Error(`launch_args cannot contain ${flag}: template ${name} sets it`);
  }
}

export type ToolInput = z.infer<typeof toolInputSchema>;

export const toolParameters = toToolSchema(toolInputSchema);

export const abortInputSchema = z.strictObject({
  task_id: z.string().min(1).describe("The full ID of an active task you own.")
});

export type AbortInput = z.infer<typeof abortInputSchema>;

export const abortParameters = toToolSchema(abortInputSchema);
