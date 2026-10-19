export const DEPTH_ENV = "PI_SUBAGENTS_DEPTH";

export const TASK_ID_ENV = "PI_SUBAGENTS_TASK_ID";

export const STOP_GRACE_MS = 5_000;

export const KILL_GRACE_MS = 2_000;

/** Starts a child supervisor's stderr line that names a failed process cleanup of its own task. */
export const STOP_FAILURE_PREFIX = "pi-subagents: owned-process cleanup failed: ";

/** Supervisor entry at the start of each run. */
export const RUN_ENTRY = "pi-subagents.run";

/** Supervisor entry after each run's process exits. */
export const END_ENTRY = "pi-subagents.end";

/** Child entry that starts each run's part of the child session. */
export const MARKER_ENTRY = "pi-subagents.marker";

/** The `setStatus` key of the child-to-supervisor coordination channel. */
export const PROTOCOL_KEY = "pi-subagents.protocol";

export const PROTOCOL_VERSION = 2;

export const RESULT_MESSAGE = "pi-subagents.result";

/** Supervisor entry when a job starts. */
export const JOB_ENTRY = "pi-subagents.job";

/** Supervisor entry after a job's command exits. */
export const JOB_END_ENTRY = "pi-subagents.job-end";

export const JOB_RESULT_MESSAGE = "pi-subagents.job-result";

export const LATE_USAGE_KIND = "pi-subagents.late";

export const TASKS_MESSAGE = "pi-subagents.tasks";

export const OPEN_EVENT = "pi-subagents:open";

export const RECORD_MAX_BYTES = 1024 * 1024;

export const LIST_DEFAULT_LIMIT = 20;

export const LIST_MAX_LIMIT = 100;
