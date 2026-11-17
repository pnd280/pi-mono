import { DEPTH_ENV, TASK_ID_ENV } from "../constants.ts";

const depthKey = Symbol.for("pi-subagents.depth");
const retained: unknown = Reflect.get(process, depthKey);
const value = process.env[DEPTH_ENV];
delete process.env[DEPTH_ENV];
const depth = typeof retained === "number" ? retained : Number(value ?? 0);
// Pi reloads extension modules. Keep depth process-owned after removing the inherited variable.
Reflect.set(process, depthKey, depth);
const taskKey = Symbol.for("pi-subagents.task-id");
const retainedTask: unknown = Reflect.get(process, taskKey);
const taskId = typeof retainedTask === "string" ? retainedTask : process.env[TASK_ID_ENV];
delete process.env[TASK_ID_ENV];
Reflect.set(process, taskKey, taskId);

export function getTaskId(): string | undefined {
  return taskId;
}

/** Keep the process depth across session replacement; shell tools must not inherit it. */
export function getDepth(): number {
  return depth;
}
