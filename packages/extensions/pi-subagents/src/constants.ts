export const DEPTH_ENV = "PI_SUBAGENTS_DEPTH";

export const TASK_ID_ENV = "PI_SUBAGENTS_TASK_ID";

export const CHECKPOINT_MAX_BYTES = 64 * 1024 * 1024;

export const STOP_GRACE_MS = 5_000;

export const KILL_GRACE_MS = 2_000;

export const STDERR_MAX_BYTES = 16 * 1024;

export const STDERR_EDGE_LINES = 20;

export const STDERR_LINE_BYTES = 512;

export const TASK_ENTRY = "pi-subagents.task";

export const RELAY_ENTRY = "pi-subagents.relay";

export const CONTROL_REPLY_ENTRY = "pi-subagents.control-reply";

export const TRANSFER_ENTRY = "pi-subagents.transfer";

export const TRANSFER_PENDING_ENTRY = "pi-subagents.transfer-pending";

export const RESULT_MESSAGE = "pi-subagents.result";

export const LATE_USAGE_KIND = "pi-subagents.late";

export const TASKS_MESSAGE = "pi-subagents.tasks";

export const OPEN_EVENT = "pi-subagents:open";

export const PROGRESS_INTERVAL_MS = 1_000;

export const RECORD_MAX_BYTES = 1024 * 1024;

export const LIST_DEFAULT_LIMIT = 20;

export const LIST_MAX_LIMIT = 100;
