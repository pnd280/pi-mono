# pi-todo adapter contract

[pi-todo adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change argument or result handling. [Todo cards](../../../docs/tools.md#todo) describes what users see.

## Arguments and results

Argument and snapshot validation use the action and status vocabularies from `pi-todo/text`, so they track the tool; a new action fails type checking until it has heading verbs. Retained task IDs must be positive safe integers. Argument IDs remain numeric so the tool can return domain errors.

A validated snapshot in retained `details.tasks` supplies todo subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new todo when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, for example `Call failed todo({})`. Unrecognised details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

Subject previews, status words, and progress summaries come from the [`pi-todo/text`](../../../../pi-todo/src/text.ts) contract, so cards match the widget and browser. The adapter sets `omitFromSummary`, so todo calls stay out of summary lines.
