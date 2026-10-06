import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { escapeAttribute as attribute } from "@pi-mono/utils/task-envelope";

import { TASKS_MESSAGE } from "./constants.ts";
import type { Tasks } from "./tasks.ts";

export function remindTasks(pi: ExtensionAPI, tasks: Tasks, depth: number): void {
  const direct = tasks
    .list()
    .filter((task) =>
      depth === 0
        ? task.parent_task_id === null
        : !tasks.list().some((parent) => parent.task_id === task.parent_task_id)
    );
  const items = direct.map(
    (task) =>
      `<task id="${attribute(task.task_id)}" state="${task.state}" outcome="${task.outcome ?? ""}" background="${task.background}">${attribute(task.description)}</task>`
  );
  pi.sendMessage(
    {
      customType: TASKS_MESSAGE,
      display: false,
      content: `<tasks>\n${items.join("\n")}\n</tasks>`
    },
    { triggerTurn: false }
  );
}
