export const WIDGET_KEY = "pi-todo";

export const ERR_REQUIRES_INTERACTIVE = "/todos requires interactive mode";

export const ERR_COLLAPSE_REQUIRES_FULLSCREEN =
  "Todo widget collapse is only available in fullscreen mode";

export const ERR_TODOS_USAGE = "Usage: /todos [collapse|expand|toggle]";

export const MSG_NO_TODOS = "No todos yet. Ask the agent to add some!";

export const MAX_WIDGET_LINES = 12;

// Model-facing list text is bounded; result details still carry the full snapshot.
export const MAX_LIST_LINES = 200;

export const MAX_LIST_CHARACTERS = 32_768;

export const MAX_TASKS = 1_000;

export const MAX_TASK_DEPTH = 8;

export const MAX_SUBJECT_LENGTH = 200;

export const MAX_DESCRIPTION_LENGTH = 4_000;

export const MAX_IN_PROGRESS_LABEL_LENGTH = 200;

export const MAX_OWNER_LENGTH = 200;

export const MAX_DEPENDENCIES = 100;

export const MAX_METADATA_DEPTH = 8;

export const MAX_METADATA_BYTES = 16 * 1_024;

export const MAX_SNAPSHOT_BYTES = 512 * 1_024;

export const TASK_DETAILS_VERSION = 2;

export const MAX_LEGACY_TASKS = 10_000;

export const MAX_LEGACY_SNAPSHOT_BYTES = 8 * 1_024 * 1_024;

// Result parameters and errors must still fit when the stored todo state is full.
export const MAX_DETAILS_OVERHEAD_BYTES = 64 * 1_024;
