/** The model-facing text of a subagent task result, written by pi-subagents and read by its display adapter. */

export type TaskState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TaskEnvelope {
  id?: string | undefined;
  state: TaskState;
  /** Escaped inside the summary element; omitted when empty. */
  summary?: string | undefined;
  /** Written unescaped, so it may contain any text, including closing tags. */
  body: string;
}

export function escapeAttribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function frame(id: string | undefined, state: TaskState) {
  const tag = state === "failed" || state === "cancelled" ? "task_error" : "task_result";

  return {
    head: `<task${id === undefined ? "" : ` id="${escapeAttribute(id)}"`} state="${state}">\n`,
    open: `<${tag}>\n`,
    close: `\n</${tag}>\n</task>`
  };
}

export function formatTaskEnvelope({ id, state, summary, body }: TaskEnvelope): string {
  const { head, open, close } = frame(id, state);

  return `${head}${summary ? `<summary>${escapeAttribute(summary)}</summary>\n` : ""}${open}${body}${close}`;
}

/**
 * Returns the unchanged body when envelope framing, identity and state match the expected values.
 * Returns `undefined` on a mismatch. Edits within a valid body or escaped summary are accepted.
 */
export function parseTaskEnvelope(
  text: string,
  expected: Pick<TaskEnvelope, "id" | "state">
): string | undefined {
  const { head, open, close } = frame(expected.id, expected.state);
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
