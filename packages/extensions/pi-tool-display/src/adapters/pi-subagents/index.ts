import type { MessageRenderer, ToolInfo } from "@earendil-works/pi-coding-agent";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";
import { parseTaskEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import type { BorrowedToolResult, DisplayProgress, ToolDisplayAdapter } from "../../contracts.ts";
import { registeredBy } from "../provenance.ts";
import { jobAdapter } from "./jobs.ts";

const argsSchema = z.object({
  description: z.string().min(1),
  prompt: z.string().min(1),
  task_id: z.string().min(1).optional(),
  model: z.string().optional(),
  thinking: z.string().optional(),
  background: z.boolean().optional(),
  delivery: z.enum(["follow_up", "steer"]).optional()
});
// Rendering also receives streamed arguments and completion messages without a prompt.
const partialArgsSchema = argsSchema.partial().extend({ prompt: z.string().optional() });
const detailsSchema = z.object({
  task_id: z.string().min(1).optional(),
  binding_id: z.string().min(1).optional(),
  description: z.string(),
  model: z.string(),
  thinking: z.string(),
  background: z.boolean(),
  delivery: z.enum(["follow_up", "steer"]),
  state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  started_at: z.number().nonnegative(),
  ended_at: z.number().nonnegative().nullable(),
  activity: z.string(),
  returned: z.enum(["background", "input"]).optional(),
  error: z.string().optional(),
  usage: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cache_read: z.number().nonnegative(),
    cache_write: z.number().nonnegative(),
    cost: z.number().nonnegative()
  })
});
const parametersSchema = z.object({
  type: z.literal("object"),
  properties: z.object({
    description: z.object({ type: z.literal("string") }),
    prompt: z.object({ type: z.literal("string") }),
    task_id: z.object({ type: z.literal("string") })
  }),
  required: z
    .array(z.string())
    .refine((fields) => fields.includes("description") && fields.includes("prompt"))
});
const category = {
  id: "subagents",
  count: { one: "ran {n} subagent", other: "ran {n} subagents" }
};
const abortArgsSchema = z.strictObject({ task_id: z.string().min(1) });
const abortParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.object({ task_id: z.object({ type: z.literal("string") }) }),
  required: z.array(z.string()).refine((fields) => fields.includes("task_id"))
});
const abortCategory = {
  id: "subagent-aborts",
  count: { one: "aborted {n} subagent", other: "aborted {n} subagents" }
};

type Details = z.infer<typeof detailsSchema>;

/** Non-breaking spaces keep the group on one row when it fits. */
function usage({ usage }: Details): string {
  if (!Object.values(usage).some((value) => value > 0)) return "";

  return `↑${formatTokenCount(usage.input)}\u00a0↓${formatTokenCount(usage.output)}\u00a0$${usage.cost.toFixed(2)}`;
}

/** Only expanded fields name a returned call's task; failures put usage before the reason. */
function secondary(details: Details): string {
  if (details.returned) return details.task_id === undefined ? "Waiting for capacity" : "";
  if (details.state === "queued") return "Waiting for capacity";
  if (details.state === "running") return "";
  if (details.state === "completed") return usage(details);

  return [usage(details), details.error].filter(Boolean).join(" · ");
}

function status(details: Details): NonNullable<DisplayProgress["status"]> {
  if (details.returned === "background")
    return { glyph: "↗", text: "in background", tone: "returned" };
  if (details.returned === "input")
    return {
      glyph: "↪",
      text: details.delivery === "steer" ? "steered" : "input queued",
      tone: "returned"
    };
  if (details.state === "queued")
    return { glyph: TUI_GLYPHS.queued, text: "queued", tone: "active" };
  if (details.state === "running") return { tone: "active" };
  if (details.state === "completed") return { glyph: TUI_GLYPHS.outcome.success, tone: "success" };

  return {
    glyph:
      details.state === "cancelled" ? TUI_GLYPHS.outcome.cancelled : TUI_GLYPHS.outcome.failure,
    text: details.state,
    tone: details.state === "cancelled" ? "cancelled" : "failure"
  };
}

function fields(
  task: string | undefined,
  background: boolean | undefined,
  delivery: string | undefined
): DisplayProgress["fields"] {
  return [
    ...(task ? [{ label: "task_id", value: task }] : []),
    ...(background ? [{ label: "background", value: "true" }] : []),
    ...(delivery === "steer" ? [{ label: "delivery", value: "steer" }] : [])
  ];
}

function openAction(result: Parameters<NonNullable<ToolDisplayAdapter["action"]>>[1]) {
  const details = detailsSchema.safeParse(result?.details).data;

  return details?.task_id && details.binding_id
    ? {
        event: "pi-subagents:open",
        data: { task_id: details.task_id, binding_id: details.binding_id }
      }
    : undefined;
}

/** Strips the task envelope when it matches the validated details. */
const envelopeText: NonNullable<ToolDisplayAdapter["textParts"]> = (text, _args, context) => {
  const details = detailsSchema.safeParse(context.result.details).data;
  const body = details && parseTaskEnvelope(text, { id: details.task_id, state: details.state });

  return [{ kind: context.isError ? "error" : "output", text: body ?? text }];
};

export const subagentDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-subagents:subagent",
  family: "invocation",
  supports: (args, result) =>
    argsSchema.safeParse(args).success && detailsSchema.safeParse(result.details).success,
  invocation: (args) => [
    { kind: "value", text: argsSchema.safeParse(args).data?.description ?? "Subagent" }
  ],
  outcome: (result) => {
    const state = detailsSchema.safeParse(result.details).data?.state;

    if (state === "failed") return "failure";

    return state === "cancelled" ? "cancelled" : undefined;
  },
  // The envelope's tags and summary repeat the card's facts, so show only the child's reply.
  // Text that does not match the validated details stays intact.
  textParts: envelopeText,
  summaryCategories: [category],
  summaryItems: (_args, { result }) => {
    const id = detailsSchema.safeParse(result?.details).data?.task_id;

    return [{ category: category.id, ...(id ? { identity: id } : {}) }];
  },
  action: (_args, result) => openAction(result),
  progress: (value, result) => {
    const args = partialArgsSchema.safeParse(value).data;
    const details = detailsSchema.safeParse(result?.details).data;
    if (!args || (result && !details)) return;
    const prompt = args.prompt ? { prompt: args.prompt } : {};

    // Before details arrive, show only explicitly requested values.
    if (!details)
      return {
        label: "Subagent",
        description: args.description ?? "…",
        identity: [args.model, args.thinking].filter(Boolean).join(":"),
        secondary: "",
        fields: fields(args.task_id, args.background, args.delivery),
        ...prompt
      };

    return {
      label: "Subagent",
      description: details.description,
      identity: `${details.model}:${details.thinking}`,
      status: status(details),
      secondary: secondary(details),
      // Returned calls describe their fixed acknowledgement, not the child's later state.
      ...(details.returned
        ? {}
        : {
            startedAt: details.started_at,
            ...(details.ended_at === null ? {} : { endedAt: details.ended_at })
          }),
      fields: fields(details.task_id, details.background, details.delivery),
      ...prompt,
      ...(details.state === "completed" && !details.returned ? { resultPreview: true } : {})
    };
  }
};

/** The abort call succeeds; its card reports the task it stopped. */
const subagentAbortDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-subagents:subagent_abort",
  family: "invocation",
  supports: (args, result) =>
    abortArgsSchema.safeParse(args).success && detailsSchema.safeParse(result.details).success,
  invocation: (args) => [
    { kind: "value", text: abortArgsSchema.safeParse(args).data?.task_id ?? "Subagent" }
  ],
  textParts: envelopeText,
  summaryCategories: [abortCategory],
  summaryItems: (args) => {
    const id = abortArgsSchema.safeParse(args).data?.task_id;

    return [{ category: abortCategory.id, ...(id ? { identity: id } : {}) }];
  },
  action: (_args, result) => openAction(result),
  progress: (value, result) => {
    const args = abortArgsSchema.partial().safeParse(value).data;
    const details = detailsSchema.safeParse(result?.details).data;
    if (!args || (result && !details)) return;

    if (!details)
      return {
        label: "Subagent",
        description: args.task_id ?? "…",
        identity: "",
        secondary: "",
        fields: fields(args.task_id, undefined, undefined)
      };

    return {
      label: "Subagent",
      description: details.description,
      identity: `${details.model}:${details.thinking}`,
      status: { glyph: TUI_GLYPHS.outcome.cancelled, text: "aborted", tone: "success" },
      secondary: usage(details),
      startedAt: details.started_at,
      ...(details.ended_at === null ? {} : { endedAt: details.ended_at }),
      fields: fields(details.task_id, undefined, undefined)
    };
  }
};

/** Pure: a background result message as subagent card input; undefined unless its details match. */
export function subagentResultCard(
  message: Pick<Parameters<MessageRenderer>[0], "content" | "details">
): { args: { description: string }; result: BorrowedToolResult } | undefined {
  const details = detailsSchema.safeParse(message.details).data;
  if (!details) return undefined;
  const { content } = message;

  return {
    args: { description: details.description },
    result: {
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
      details: message.details
    }
  };
}

export function piSubagentAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (
    !tool ||
    !["subagent", "subagent_abort", "job", "job_abort"].includes(tool.name) ||
    !registeredBy(tool, "pi-subagents")
  )
    return;
  if (tool.name === "job" || tool.name === "job_abort") return jobAdapter(tool);
  if (tool.name === "subagent_abort")
    return abortParametersSchema.safeParse(tool.parameters).success
      ? subagentAbortDisplayAdapter
      : undefined;

  return parametersSchema.safeParse(tool.parameters).success ? subagentDisplayAdapter : undefined;
}
