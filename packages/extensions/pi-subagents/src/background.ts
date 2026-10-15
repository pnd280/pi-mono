// OpenCode task.ts at 907b3bc, with the dash escaped for the workspace's text convention.
export const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work \u2014 avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response."
].join("\n");

/** Where job results go: a supervisor that waits for results, or a run whose end stops its jobs. */
export function jobDelivery(delivers: boolean): string {
  return delivers
    ? "The result arrives automatically when the command exits; do not sleep or poll."
    : "Jobs stop when your final reply ends this run. Use them only for processes you need during the run, such as a server you test. Run finite commands in the foreground.";
}

export function jobStarted(logFile: string, delivers: boolean): string {
  return [
    `The job is running in the background. Its output goes to the log file ${logFile}`,
    jobDelivery(delivers),
    "Read the log file to check output while it runs. Stop the job with job_abort."
  ].join("\n");
}

export const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work \u2014 avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response."
].join("\n");
