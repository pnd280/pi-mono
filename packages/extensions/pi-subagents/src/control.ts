import { randomUUID } from "node:crypto";

import type { ChildRun } from "./child.ts";
import type { ControlRequest } from "./protocol.ts";

/**
 * Ask a direct child to deliver input, abort, or promotion to a task that its subtree runs.
 * Returns undefined when the child was already closing and nothing was sent.
 */
export async function requestControl(run: ChildRun, value: ControlRequest) {
  const request_id = randomUUID();
  const reply = await run.ask("control", { ...value, request_id }, (message) =>
    message.kind === "control-reply" && message.request_id === request_id ? message : undefined
  );
  if (!reply) return;
  if (reply.error) throw new Error(reply.error);
  if (value.kind === "input" && !reply.details)
    throw new Error("Subagent input acknowledgement is missing its result");
  if (value.kind !== "input" && reply.record?.task_id !== value.task_id)
    throw new Error(`Invalid subagent ${value.kind} acknowledgement`);

  return reply;
}
