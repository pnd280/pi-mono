# [pi-agent-summary](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): Pi lifecycle and tool-event adapter, working-message registration, and custom entry persistence.
- [src/timer.ts](src/timer.ts): monotonic elapsed time and interval cleanup.
- [src/changes.ts](src/changes.ts): bounded source retention and net line counts.
- [src/summary.ts](src/summary.ts): stored summary schema and duration formatting.
- [src/render.ts](src/render.ts): compact and expanded summaries with theme diff colors.

## Constraints

- Use `appendEntry`, never `sendMessage`, so summaries stay outside model context.
- Time from the first `agent_start` to `agent_settled`, not `turn_end` or retryable `agent_end`.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Subscribe to shared [file-mutations](../../libs/src/file-mutations/README.md) for verified native `edit` and `write` operations. Do not reread targets, scan repositories, or infer file changes from bash commands.
- Reuse observed patches for single mutations and [bounded-diff](../../libs/src/bounded-diff/README.md) for net comparisons. Never persist contents or patches; distinguish unavailable statistics from zero changes.
- Use monotonic timing; never run intervals during extension loading or after shutdown.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation). Cover run boundaries, repeated starts, cleanup, context-free replay, and non-TUI execution. Protect bash-call counting, path deduplication, net edits, reverted changes, unavailable observations, and theme-colored summary rendering.
