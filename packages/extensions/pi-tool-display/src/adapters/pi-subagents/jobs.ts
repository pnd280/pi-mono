import type { MessageRenderer, ToolInfo } from "@earendil-works/pi-coding-agent";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { parseJobEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import type { BorrowedToolResult, DisplayProgress, ToolDisplayAdapter } from "../../contracts.ts";

const argsSchema = z.strictObject({
  command: z.string().min(1),
  description: z.string().min(1),
  timeout: z.number().positive().optional()
});
const parametersSchema = z.object({
  type: z.literal("object"),
  properties: z.object({
    command: z.object({ type: z.literal("string") }),
    description: z.object({ type: z.literal("string") }),
    timeout: z.object({ type: z.literal("number") })
  }),
  required: z
    .array(z.string())
    .refine((fields) => fields.includes("command") && fields.includes("description"))
});
const abortArgsSchema = z.strictObject({ job_id: z.string().min(1) });
const abortParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.object({ job_id: z.object({ type: z.literal("string") }) }),
  required: z.array(z.string()).refine((fields) => fields.includes("job_id"))
});
const fields = {
  job_id: z.string().min(1),
  binding_id: z.string().min(1),
  description: z.string(),
  command: z.string(),
  log_file: z.string().min(1),
  started_at: z.number().nonnegative()
};
const activeSchema = z.object({
  ...fields,
  state: z.literal("active"),
  exit_code: z.null(),
  ended_at: z.null()
});
const inactiveSchema = z.object({
  ...fields,
  state: z.literal("inactive"),
  outcome: z.enum(["completed", "failed", "cancelled"]),
  exit_code: z.number().nullable(),
  ended_at: z.number().nonnegative().nullable(),
  error: z.string().optional()
});
const detailsSchema = z.discriminatedUnion("state", [activeSchema, inactiveSchema]);
// A result message carries no call arguments; its card arguments come from the details.
const messageArgsSchema = z.object({ description: z.string(), command: z.string() });

type Details = z.infer<typeof detailsSchema>;

type Inactive = z.infer<typeof inactiveSchema>;

/** Job IDs are UUIDs; the collapsed card shows their first group. */
const shortId = (id: string) => id.slice(0, 8);

function expandedFields(id: string | undefined, timeout?: number): DisplayProgress["fields"] {
  return [
    ...(id ? [{ label: "job_id", value: id }] : []),
    ...(timeout === undefined ? [] : [{ label: "timeout", value: `${timeout}s` }])
  ];
}

function times(details: Details): Pick<DisplayProgress, "startedAt" | "endedAt"> {
  return {
    startedAt: details.started_at,
    ...(details.ended_at === null ? {} : { endedAt: details.ended_at })
  };
}

function outcomeStatus({ outcome }: Inactive): NonNullable<DisplayProgress["status"]> {
  if (outcome === "completed")
    return { glyph: TUI_GLYPHS.outcome.success, text: "completed", tone: "success" };
  if (outcome === "failed")
    return { glyph: TUI_GLYPHS.outcome.failure, text: "failed", tone: "failure" };

  return { glyph: TUI_GLYPHS.outcome.cancelled, text: "cancelled", tone: "cancelled" };
}

/** The exit code and any recorded error of an ended job. */
function ending(details: Inactive): string {
  return [details.exit_code === null ? "" : `exit ${details.exit_code}`, details.error]
    .filter(Boolean)
    .join(" · ");
}

function openAction(result: BorrowedToolResult | undefined) {
  const details = detailsSchema.safeParse(result?.details).data;

  return details
    ? {
        event: "pi-subagents:open",
        data: { job_id: details.job_id, binding_id: details.binding_id }
      }
    : undefined;
}

/** Strips the job envelope when it matches the validated details. */
const envelopeText: NonNullable<ToolDisplayAdapter["textParts"]> = (text, _args, context) => {
  const details = detailsSchema.safeParse(context.result.details).data;
  const body =
    details &&
    parseJobEnvelope(text, {
      id: details.job_id,
      state: details.state,
      outcome: details.state === "inactive" ? details.outcome : undefined,
      exit_code: details.exit_code
    });

  return [{ kind: context.isError ? "error" : "output", text: body ?? text }];
};

/** The call returns at once; its card reports the start, not the job's later state. */
const jobDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-subagents:job",
  family: "invocation",
  supports: (args, result) =>
    argsSchema.safeParse(args).success && detailsSchema.safeParse(result.details).success,
  invocation: (args) => [
    { kind: "value", text: argsSchema.safeParse(args).data?.description ?? "Job" }
  ],
  textParts: envelopeText,
  action: (_args, result) => openAction(result),
  progress: (value, result) => {
    const args = argsSchema.partial().safeParse(value).data;
    const details = detailsSchema.safeParse(result?.details).data;
    if (!args || (result && !details)) return;

    if (!details)
      return {
        label: "Job",
        description: args.description ?? "…",
        identity: args.command ?? "",
        secondary: "",
        fields: expandedFields(undefined, args.timeout)
      };

    return {
      label: "Job",
      description: details.description,
      identity: details.command,
      status: { glyph: "↗", text: "returned; job continues in background", tone: "returned" },
      secondary: shortId(details.job_id),
      fields: expandedFields(details.job_id, args.timeout)
    };
  }
};

/** The abort call succeeds; its card reports the job it stopped, or the job's own outcome. */
const jobAbortDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-subagents:job_abort",
  family: "invocation",
  supports: (args, result) =>
    abortArgsSchema.safeParse(args).success && inactiveSchema.safeParse(result.details).success,
  invocation: (args) => [
    { kind: "value", text: abortArgsSchema.safeParse(args).data?.job_id ?? "Job" }
  ],
  textParts: envelopeText,
  action: (_args, result) => openAction(result),
  progress: (value, result) => {
    const args = abortArgsSchema.partial().safeParse(value).data;
    const details = inactiveSchema.safeParse(result?.details).data;
    if (!args || (result && !details)) return;

    if (!details)
      return {
        label: "Job",
        description: args.job_id ?? "…",
        identity: "",
        secondary: "",
        fields: expandedFields(args.job_id)
      };

    return {
      label: "Job",
      description: details.description,
      identity: details.command,
      status:
        details.outcome === "cancelled"
          ? { glyph: TUI_GLYPHS.outcome.cancelled, text: "aborted", tone: "success" }
          : outcomeStatus(details),
      secondary: ending(details),
      ...times(details),
      fields: expandedFields(details.job_id)
    };
  }
};

/** Renders only the `pi-subagents.job-result` message; no tool resolves to it. */
export const jobResultDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-subagents:job-result",
  family: "invocation",
  supports: (args, result) =>
    messageArgsSchema.safeParse(args).success && inactiveSchema.safeParse(result.details).success,
  invocation: (args) => [
    { kind: "value", text: messageArgsSchema.safeParse(args).data?.description ?? "Job" }
  ],
  outcome: (result) => {
    const outcome = inactiveSchema.safeParse(result.details).data?.outcome;

    if (outcome === "failed") return "failure";

    return outcome === "cancelled" ? "cancelled" : undefined;
  },
  textParts: envelopeText,
  action: (_args, result) => openAction(result),
  progress: (_args, result) => {
    const details = inactiveSchema.safeParse(result?.details).data;
    if (!details) return;

    return {
      label: "Job",
      description: details.description,
      identity: details.command,
      status: outcomeStatus(details),
      // The output body ends with the log path, which a collapsed preview can omit.
      secondary: [ending(details), `log: ${details.log_file}`].filter(Boolean).join(" · "),
      ...times(details),
      fields: expandedFields(details.job_id),
      resultPreview: true
    };
  }
};

/** Pure: a job result message as card input; undefined unless its details match. */
export function jobResultCard(
  message: Pick<Parameters<MessageRenderer>[0], "content" | "details">
): { args: { description: string; command: string }; result: BorrowedToolResult } | undefined {
  const details = inactiveSchema.safeParse(message.details).data;
  if (!details) return undefined;
  const { content } = message;

  return {
    args: { description: details.description, command: details.command },
    result: {
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
      details: message.details
    }
  };
}

/** Expects a tool already verified as registered by pi-subagents. */
export function jobAdapter(tool: ToolInfo): ToolDisplayAdapter | undefined {
  if (tool.name === "job")
    return parametersSchema.safeParse(tool.parameters).success ? jobDisplayAdapter : undefined;
  if (tool.name === "job_abort")
    return abortParametersSchema.safeParse(tool.parameters).success
      ? jobAbortDisplayAdapter
      : undefined;

  return undefined;
}
