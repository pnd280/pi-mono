import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import type {
  BorrowedToolResult,
  HeadingVerbs,
  InvocationPart,
  Outcome,
  ToolDisplayAdapter
} from "../../contracts.ts";

const TASK_ACTIONS = ["create", "update", "list", "get", "delete", "clear"] as const;
const TASK_STATUSES = ["pending", "in_progress", "completed", "deleted"] as const;

type TaskAction = (typeof TASK_ACTIONS)[number];

type TaskStatus = (typeof TASK_STATUSES)[number];

const STATUS_TEXT = {
  pending: "pending",
  in_progress: "in progress",
  completed: "completed",
  deleted: "deleted"
} satisfies Record<TaskStatus, string>;

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
  id: z.number(),
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
    ? { kind: "value", text: presentTaskText(subject) }
    : { kind: "annotation", text: "…" };
}

/** Match the extension's compact todo subject budget before terminal wrapping. */
function presentTaskText(text: string): string {
  const compact = compactDisplayText(text).trim();
  const points = Array.from(compact);

  return points.length <= 200 ? compact : points.slice(0, 199).join("") + "…";
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
  if (args.status !== undefined) changes.push(`status → ${STATUS_TEXT[args.status]}`);
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
              { kind: "value", text: STATUS_TEXT[parsed.status] },
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

function progressSummary(tasks: readonly { status: TaskStatus }[]): string {
  const visible = tasks.filter((task) => task.status !== "deleted");
  if (!visible.length)
    return tasks.length ? `${tasks.length} deleted · no active todos` : "No todos";
  const completed = visible.filter((task) => task.status === "completed").length;
  const inProgress = visible.filter((task) => task.status === "in_progress").length;
  const pending = visible.filter((task) => task.status === "pending").length;
  const header: string[] = [];
  if (completed > 0) header.push(`${completed}/${visible.length} completed`);
  if (inProgress > 0) header.push(`${inProgress} in progress`);
  if (pending > 0) header.push(`${pending} pending`);

  return header.join(" · ");
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
    const progress = progressSummary(tasks);
    const id =
      parsed.action === "create" && details.nextId !== undefined ? details.nextId - 1 : parsed.id;
    const task = tasks.find((task) => task.id === id);
    if (task && ["create", "update", "get", "delete"].includes(parsed.action))
      return { text: `#${task.id} ${STATUS_TEXT[task.status]} · ${progress}` };

    if (parsed.action === "list" && (parsed.status !== undefined || parsed.includeDeleted)) {
      const matching = tasks.filter(
        (task) =>
          (parsed.includeDeleted || task.status !== "deleted") &&
          (parsed.status === undefined || task.status === parsed.status)
      ).length;

      return { text: `${matching} ${matching === 1 ? "todo" : "todos"} listed · ${progress}` };
    }

    return { text: progress };
  }
};

/** pi-todo registers this tool; resolve its adapter only for verified provenance. */
export function piTodoAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || tool.name !== "todo") return undefined;
  if (["builtin", "sdk"].includes(tool.sourceInfo.source)) return undefined;
  const path = tool.sourceInfo.path.replaceAll("\\", "/");
  const owned =
    /^npm:pi-todo(?:@[^/]+)?$/.test(tool.sourceInfo.source) ||
    /(?:^|\/)pi-todo\/(?:src\/)?index\.[cm]?[jt]s$/.test(path);
  if (!owned || !parametersSchema.safeParse(tool.parameters).success) return undefined;

  return todoDisplayAdapter;
}
