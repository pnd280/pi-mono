# [pi-agent-summary](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): Pi lifecycle and tool-event adapter, working-message registration, and custom entry persistence.
- [src/timer.ts](src/timer.ts): monotonic elapsed time and interval cleanup.
- [src/changes.ts](src/changes.ts): bounded file reads and net line counts for `edit` and `write` targets.
- [src/summary.ts](src/summary.ts): stored summary schema and duration formatting.
- [src/render.ts](src/render.ts): compact and expanded summaries with theme diff colors.

## Constraints

Follow the [workspace development conventions](../../../docs/development.md).

- Use `appendEntry`, never `sendMessage`, so summaries stay outside model context.
- Start timing at the first `agent_start` and end the run at `agent_settled`, not individual `turn_end` or retryable `agent_end` events.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Observe only `edit` and `write` targets through awaited tool hooks. Do not scan repositories or infer file changes from bash commands.
- Reuse the shared [file-observation](../../libs/src/file-observation/README.md) and [bounded-diff](../../libs/src/bounded-diff/README.md) helpers. Keep file contents and patches out of persisted summaries. Distinguish unavailable statistics from zero changes.
- Keep timing independent of the system wall clock. Do not start intervals during extension loading or leave them running after shutdown.

## Validation

Use [package validation](README.md#validation). Cover run boundaries, repeated starts, cleanup, context-free replay, and non-TUI execution. Protect bash-call counting, path deduplication, net edits, reverted changes, unavailable observations, and theme-colored summary rendering.
