export const DEPTH_ENV = "PI_SUBAGENTS_DEPTH";

export const TASK_ID_ENV = "PI_SUBAGENTS_TASK_ID";

/** The largest child session file that readers parse. */
export const SESSION_MAX_BYTES = 64 * 1024 * 1024;

export const STOP_GRACE_MS = 5_000;

export const KILL_GRACE_MS = 2_000;

export const STDERR_MAX_BYTES = 16 * 1024;

export const STDERR_EDGE_LINES = 20;

export const STDERR_LINE_BYTES = 512;

/** Supervisor entry at the start of each run. */
export const RUN_ENTRY = "pi-subagents.run";

/** Supervisor entry after each run's process exits. */
export const END_ENTRY = "pi-subagents.end";

/** Child entry that starts each run's part of the child session. */
export const MARKER_ENTRY = "pi-subagents.marker";

/** The `setStatus` key of the child-to-supervisor coordination channel. */
export const PROTOCOL_KEY = "pi-subagents.protocol";

export const PROTOCOL_VERSION = 2;

/** Debounce for nested task updates; a run's exit sends its update at once. */
export const UPDATE_DEBOUNCE_MS = 100;

export const RESULT_MESSAGE = "pi-subagents.result";

export const LATE_USAGE_KIND = "pi-subagents.late";

export const TASKS_MESSAGE = "pi-subagents.tasks";

export const OPEN_EVENT = "pi-subagents:open";

export const PROGRESS_INTERVAL_MS = 1_000;

export const RECORD_MAX_BYTES = 1024 * 1024;

export const LIST_DEFAULT_LIMIT = 20;

export const LIST_MAX_LIMIT = 100;
