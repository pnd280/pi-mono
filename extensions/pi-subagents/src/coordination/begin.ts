import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext
} from "@earendil-works/pi-coding-agent";

import { getTaskId } from "../child/depth.ts";
import { MARKER_ENTRY, PROTOCOL_KEY, PROTOCOL_VERSION } from "../constants.ts";
import { resumePoint } from "../history/sessions.ts";
import { beginSchema, decode, encode, errorText, type ChildMessage } from "./protocol.ts";

const runKey = Symbol.for("pi-subagents.run");

/** This child process's run. Pi reloads extension modules, so the process holds it. */
export function currentRun(): string | undefined {
  const value: unknown = Reflect.get(process, runKey);

  return typeof value === "string" ? value : undefined;
}

/** Send a protocol message to the supervisor. RPC mode emits each status update unchanged. */
export function send(ui: Pick<ExtensionUIContext, "setStatus">, message: ChildMessage): void {
  ui.setStatus(PROTOCOL_KEY, encode(message));
}

async function start(
  pi: ExtensionAPI,
  text: string,
  ctx: ExtensionCommandContext
): Promise<Extract<ChildMessage, { kind: "begun" }>> {
  const request = decode(beginSchema, text);
  if (!request || request.task_id !== getTaskId())
    throw new Error("Invalid subagent begin request");
  if (currentRun() !== undefined) throw new Error("Subagent run has already begun");
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile === undefined) throw new Error("Subagent session is not saved");
  let leafId = ctx.sessionManager.getLeafId();
  let interrupted = false;

  if (request.previous_run_id !== null) {
    const point = resumePoint(ctx.sessionManager.getEntries(), request.previous_run_id);
    if (!point) throw new Error("Subagent session history is unavailable");
    interrupted = point.interrupted;

    if (point.leafId !== leafId) {
      const result = await ctx.navigateTree(point.leafId, { summarize: false });
      if (result.cancelled || ctx.sessionManager.getLeafId() !== point.leafId)
        throw new Error("Subagent session could not continue its previous run");
    }

    leafId = point.leafId;
  }

  pi.appendEntry(MARKER_ENTRY, { task_id: request.task_id, run_id: request.run_id });
  const markerId = ctx.sessionManager.getLeafId();
  if (markerId === null || markerId === leafId)
    throw new Error("Subagent run marker was not saved");
  // From here, navigation and session replacement are refused.
  Reflect.set(process, runKey, request.run_id);

  return {
    kind: "begun",
    version: PROTOCOL_VERSION,
    task_id: request.task_id,
    run_id: request.run_id,
    session_id: ctx.sessionManager.getSessionId(),
    session_file: sessionFile,
    marker_id: markerId,
    leaf_id: leafId,
    interrupted
  };
}

/** Handle `/subagents begin`: continue the previous run's history, then mark this run. */
export async function begin(
  pi: ExtensionAPI,
  text: string,
  ctx: ExtensionCommandContext
): Promise<void> {
  let message: ChildMessage;

  try {
    message = await start(pi, text, ctx);
  } catch (error) {
    const runId = decode(beginSchema, text)?.run_id;
    if (runId === undefined) throw error;
    message = {
      kind: "begin-failed",
      run_id: runId,
      error: errorText(error, "Subagent begin failed")
    };
  }

  send(ctx.ui, message);
}
