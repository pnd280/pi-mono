import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

import { deliverySchema } from "../details.ts";

/** Bounds that keep a run record well below `RECORD_MAX_BYTES`. */
const LAUNCH_ARGS_MAX = 32;
const LAUNCH_ARG_MAX_LENGTH = 2048;

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
      "A provider/id model. Defaults to the task's previously requested model on resume, and to your current model otherwise."
    ),
  thinking: z
    .enum(MODEL_THINKING_LEVELS)
    .optional()
    .describe(
      "Defaults to the task's previously requested level on resume, and to your current level otherwise."
    ),
  launch_args: z
    .array(z.string().max(LAUNCH_ARG_MAX_LENGTH))
    .max(LAUNCH_ARGS_MAX)
    .optional()
    .describe(
      'Extra Pi CLI arguments for the child process, such as ["--no-extensions", "-e", "path"]. Defaults to the task\'s previous value on resume; [] clears it.'
    )
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
 * fails.
 */
export function checkLaunchArgs(args: readonly string[]): void {
  for (const arg of args) {
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const owner = OWNED_FLAGS.get(flag);
    if (owner) throw new Error(`launch_args cannot contain ${flag}: use the ${owner} parameter`);
  }

  const last = args.at(-1);
  if (last !== undefined && VALUE_FLAGS.has(last))
    throw new Error(`launch_args cannot end with ${last}: give it a value`);
}

export type ToolInput = z.infer<typeof toolInputSchema>;

export const toolParameters = toToolSchema(toolInputSchema);

export const abortInputSchema = z.strictObject({
  task_id: z.string().min(1).describe("The full ID of an active task you own.")
});

export type AbortInput = z.infer<typeof abortInputSchema>;

export const abortParameters = toToolSchema(abortInputSchema);
