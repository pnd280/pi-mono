import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { registeredBy } from "@pi-mono/utils/provenance";
import {
  formatTodosSummary,
  presentCompactTaskText,
  TASK_ACTIONS,
  TASK_STATUS_TEXT,
  TASK_STATUSES
} from "pi-todo/text";
import { z } from "zod";

import type {
  BorrowedToolResult,
  HeadingVerbs,
  InvocationPart,
  Outcome,
  ToolDisplayAdapter
} from "../../contracts.ts";

type TaskAction = (typeof TASK_ACTIONS)[number];

const argsSchema = z.object({
  action: z.enum(TASK_ACTIONS),
  id: z.number().optional(),
  subject: z.string().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  parentId: z.number().nullable().optional(),
  blockedBy: z.array(z.number()).optional(),
  addBlockedBy: z.array(z.number()).optional(),
  removeBlockedBy: z.array(z.number()).optional(),
  owner: z.string().optional(),
  description: z.string().optional(),
  inProgressLabel: z.string().optional(),
  includeDeleted: z.boolean().optional()
});

const taskSchema = z.object({
  id: z.int().positive(),
  subject: z.string(),
  status: z.enum(TASK_STATUSES)
});

const detailsSchema = z.object({
  error: z.string().optional(),
  tasks: z.array(taskSchema).optional(),
  nextId: z.int().positive().optional().catch(undefined)
});

const parametersSchema = z.object({
  type: z.literal("object"),
  properties: z.object({ action: z.object({ type: z.literal("string") }) })
});

const TOOL_TITLE = "Todos";

const singleTaskActions: ReadonlySet<TaskAction> = new Set(["create", "update", "get", "delete"]);

const actionVerbs = {
  create: { action: "Create", pending: "Creating", complete: "Created" },
  update: { action: "Update", pending: "Updating", complete: "Updated" },
  list: { action: "List", pending: "Listing", complete: "Listed" },
  get: { action: "Show", pending: "Showing", complete: "Shown" },
  delete: { action: "Delete", pending: "Deleting", complete: "Deleted" },
  clear: { action: "Clear", pending: "Clearing", complete: "Cleared" }
} satisfies Record<TaskAction, HeadingVerbs>;

function titledVerbs(action: TaskAction): HeadingVerbs {
  const verb = actionVerbs[action];

  return {
    action: `${TOOL_TITLE} · ${verb.action}`,
    pending: `${TOOL_TITLE} · ${verb.pending}`,
    complete: `${TOOL_TITLE} · ${verb.complete}`
  };
}

/**
 * Literal scope shared by every todo call so adjacent calls join one group.
 * The value is internal and never displayed for titled groups; keep it distinct
 * from path filters an exploration adapter could produce.
 */
const GROUP_SCOPE = "pi-todo:todo";

function parseArgs(args: unknown) {
  return argsSchema.safeParse(args).data;
}

function parseDetails(result: BorrowedToolResult | undefined) {
  return detailsSchema.safeParse(result?.details).data;
}

function idPart(id: number | undefined): InvocationPart {
  return id === undefined ? { kind: "annotation", text: "…" } : { kind: "value", text: `#${id}` };
}

function subjectPart(subject: string | undefined): InvocationPart {
  return subject
    ? { kind: "value", text: presentCompactTaskText(subject) }
    : { kind: "annotation", text: "…" };
}

function taskSubject(
  result: BorrowedToolResult | undefined,
  id: number | undefined
): string | undefined {
  if (id === undefined) return undefined;
  const subject = parseDetails(result)?.tasks?.find((task) => task.id === id)?.subject;

  return subject === undefined || subject === "" ? undefined : subject;
}

function changeSummary(args: NonNullable<ReturnType<typeof parseArgs>>): string {
  const changes: string[] = [];
  if (args.status !== undefined) changes.push(`status → ${TASK_STATUS_TEXT[args.status]}`);
  if (args.subject !== undefined) changes.push("subject");
  if (args.description !== undefined) changes.push("description");
  if (args.inProgressLabel !== undefined) changes.push("activity");
  if (args.owner !== undefined) changes.push("owner");
  if (args.parentId !== undefined)
    changes.push(args.parentId === null ? "detached" : `parent → #${args.parentId}`);
  if ((args.addBlockedBy?.length ?? 0) > 0)
    changes.push(`blocked by +${args.addBlockedBy?.length ?? 0}`);
  if ((args.removeBlockedBy?.length ?? 0) > 0)
    changes.push(`blocked by -${args.removeBlockedBy?.length ?? 0}`);

  return changes.join(" · ");
}

function idSubjectParts(
  result: BorrowedToolResult | undefined,
  id: number | undefined
): InvocationPart[] {
  const subject = taskSubject(result, id);

  return subject === undefined
    ? [idPart(id)]
    : [{ kind: "annotation", text: `#${id} ` }, subjectPart(subject)];
}

function invocation(args: unknown, result?: BorrowedToolResult): InvocationPart[] {
  const parsed = parseArgs(args);
  if (!parsed) return [{ kind: "annotation", text: "…" }];

  switch (parsed.action) {
    case "create": {
      const parts = [subjectPart(parsed.subject)];
      if (parsed.parentId !== undefined && parsed.parentId !== null)
        parts.push({ kind: "annotation", text: " under " }, idPart(parsed.parentId));
      const blockedBy = parsed.blockedBy;
      if (blockedBy !== undefined && blockedBy.length > 0)
        parts.push({
          kind: "annotation",
          text: ` blocked by ${blockedBy.map((id) => `#${id}`).join(",")}`
        });

      return parts;
    }

    case "update": {
      const parts = idSubjectParts(result, parsed.id);
      const changes = changeSummary(parsed);
      if (changes) parts.push({ kind: "annotation", text: ` · ${changes}` });

      return parts;
    }

    case "list": {
      const parts: InvocationPart[] =
        parsed.status === undefined
          ? [{ kind: "annotation", text: "all todos" }]
          : [
              { kind: "value", text: TASK_STATUS_TEXT[parsed.status] },
              { kind: "annotation", text: " todos" }
            ];
      if (parsed.includeDeleted) parts.push({ kind: "annotation", text: " including deleted" });

      return parts;
    }

    case "get":
    case "delete":
      return idSubjectParts(result, parsed.id);

    case "clear":
      return [];
  }
}

/**
 * Presentation for the todo tool's own result envelope. Arguments and results are
 * borrowed and validated; the adapter never changes retained data or model content.
 */
export const todoDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-todo:todo",
  family: "invocation",
  groupTitle: TOOL_TITLE,
  supports: (args) => parseArgs(args) !== undefined,
  headingVerbs(args) {
    const action = parseArgs(args)?.action;

    return action === undefined ? undefined : titledVerbs(action);
  },
  invocation,
  // Todo bookkeeping is not work worth summarizing, including invalid calls.
  omitFromSummary: true,
  exploration(args, result) {
    const parsed = parseArgs(args);
    if (!parsed) return undefined;

    return [
      {
        parts: invocation(args, result),
        scope: { kind: "filter" as const, value: GROUP_SCOPE }
      }
    ];
  },
  outcome(result): Outcome | undefined {
    return parseDetails(result)?.error ? "failure" : undefined;
  },
  summary(result, { args, outcome }) {
    if (outcome !== "success") return undefined;
    const details = parseDetails(result);
    const parsed = parseArgs(args);
    if (!parsed || !details?.tasks || details.error) return undefined;
    const tasks = details.tasks;
    const progress = formatTodosSummary(tasks);
    const id =
      parsed.action === "create" && details.nextId !== undefined ? details.nextId - 1 : parsed.id;
    const task = tasks.find((task) => task.id === id);
    if (task && singleTaskActions.has(parsed.action))
      return { text: `#${task.id} ${TASK_STATUS_TEXT[task.status]} · ${progress}` };

    if (parsed.action === "list" && (parsed.status !== undefined || parsed.includeDeleted)) {
      const matching = tasks.filter(
        (task) =>
          (parsed.includeDeleted || task.status !== "deleted") &&
          (parsed.status === undefined || task.status === parsed.status)
      ).length;

      return {
        text: `${matching} matching ${matching === 1 ? "todo" : "todos"} · ${progress}`,
        preserveOutput: true
      };
    }

    // Lists can omit rows while details retain every todo. Keep the producer's notice visible.
    return { text: progress, preserveOutput: parsed.action === "list" };
  }
};

/** pi-todo registers this tool; resolve its adapter only for verified provenance. */
export function piTodoAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (
    tool?.name !== "todo" ||
    !registeredBy(tool, "pi-todo") ||
    !parametersSchema.safeParse(tool.parameters).success
  )
    return undefined;

  return todoDisplayAdapter;
}
