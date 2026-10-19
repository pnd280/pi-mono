/**
 * The model-facing text of subagent task results and background job results, written by
 * pi-subagents and read by its display adapter.
 */

export type TaskState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TaskEnvelope {
  id?: string | undefined;
  state: TaskState;
  /** Escaped inside the summary element; omitted when empty. */
  summary?: string | undefined;
  /** Written unescaped, so it may contain any text, including closing tags. */
  body: string;
}

export type JobOutcome = "completed" | "failed" | "cancelled";

/** An active job has no outcome; `exit_code` is omitted when it is unknown. */
export interface JobEnvelope {
  id: string;
  state: "active" | "inactive";
  outcome?: JobOutcome | undefined;
  exit_code?: number | null | undefined;
  /** Escaped inside the summary element; omitted when empty. */
  summary?: string | undefined;
  /** Written unescaped, so it may contain any text, including closing tags. */
  body: string;
}

type Frame = { head: string; open: string; close: string };

export function escapeAttribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Failed and cancelled work uses the `_error` body element. */
function frame(
  name: "task" | "job",
  attributes: readonly (readonly [string, string | number | null | undefined])[],
  error: boolean
): Frame {
  const tag = `${name}_${error ? "error" : "result"}`;
  const written = attributes
    .flatMap(([key, value]) =>
      value === undefined || value === null ? [] : [` ${key}="${escapeAttribute(String(value))}"`]
    )
    .join("");

  return {
    head: `<${name}${written}>\n`,
    open: `<${tag}>\n`,
    close: `\n</${tag}>\n</${name}>`
  };
}

function taskFrame(id: string | undefined, state: TaskState): Frame {
  return frame(
    "task",
    [
      ["id", id],
      ["state", state]
    ],
    state === "failed" || state === "cancelled"
  );
}

function jobFrame({ id, state, outcome, exit_code }: Omit<JobEnvelope, "summary" | "body">): Frame {
  return frame(
    "job",
    [
      ["id", id],
      ["state", state],
      ["outcome", outcome],
      ["exit_code", exit_code]
    ],
    outcome === "failed" || outcome === "cancelled"
  );
}

function format({ head, open, close }: Frame, summary: string | undefined, body: string): string {
  return `${head}${summary ? `<summary>${escapeAttribute(summary)}</summary>\n` : ""}${open}${body}${close}`;
}

/** The unchanged body when the framing matches, otherwise `undefined`. */
function parse(text: string, { head, open, close }: Frame): string | undefined {
  if (!text.startsWith(head)) return undefined;

  let start = head.length;

  if (text.startsWith("<summary>", start)) {
    const end = text.indexOf("</summary>\n", start);
    // An escaped summary has no `<`, so its first closing tag is its own.
    if (end < 0 || text.slice(start, end).includes("<", "<summary>".length)) return undefined;
    start = end + "</summary>\n".length;
  }

  if (!text.startsWith(open, start)) return undefined;
  start += open.length;
  const end = text.length - close.length;

  return end >= start && text.endsWith(close) ? text.slice(start, end) : undefined;
}

export function formatTaskEnvelope({ id, state, summary, body }: TaskEnvelope): string {
  return format(taskFrame(id, state), summary, body);
}

/**
 * Returns the unchanged body when envelope framing, identity and state match the expected values.
 * Returns `undefined` on a mismatch. Edits within a valid body or escaped summary are accepted.
 */
export function parseTaskEnvelope(
  text: string,
  expected: Pick<TaskEnvelope, "id" | "state">
): string | undefined {
  return parse(text, taskFrame(expected.id, expected.state));
}

export function formatJobEnvelope({ summary, body, ...attributes }: JobEnvelope): string {
  return format(jobFrame(attributes), summary, body);
}

/** Like `parseTaskEnvelope`: the identity, state, outcome, and exit code must all match. */
export function parseJobEnvelope(
  text: string,
  expected: Omit<JobEnvelope, "summary" | "body">
): string | undefined {
  return parse(text, jobFrame(expected));
}
