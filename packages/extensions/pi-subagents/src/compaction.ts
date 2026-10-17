import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { escapeAttribute as attribute } from "@pi-mono/utils/task-envelope";

import { TASKS_MESSAGE } from "./constants.ts";
import type { Jobs } from "./jobs/registry.ts";
import type { Tasks } from "./tasks/registry.ts";

/** Direct tasks, and the jobs on this ancestry when `jobs` is set. */
export function remindTasks(pi: ExtensionAPI, tasks: Tasks, jobs: Jobs | undefined): void {
  const items = tasks.tree
    .direct()
    .map(
      (task) =>
        `<task id="${attribute(task.task_id)}" state="${task.state}" outcome="${task.outcome ?? ""}" background="${task.background}">${attribute(task.description)}</task>`
    );
  const jobItems = (jobs?.list() ?? []).map(
    (job) =>
      `<job id="${attribute(job.job_id)}" state="${job.state}" outcome="${job.state === "inactive" ? job.outcome : ""}" exit_code="${job.exit_code ?? ""}">${attribute(job.description)}</job>`
  );
  pi.sendMessage(
    {
      customType: TASKS_MESSAGE,
      display: false,
      content: [
        `<tasks>\n${items.join("\n")}\n</tasks>`,
        ...(jobs ? [`<jobs>\n${jobItems.join("\n")}\n</jobs>`] : [])
      ].join("\n")
    },
    { triggerTurn: false }
  );
}
