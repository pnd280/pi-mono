# [pi-session-utils](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): extension command and flag registration.
- [src/commands.ts](src/commands.ts): `/sesh` dispatch and session-switch lifecycle.
- [src/persist.ts](src/persist.ts): copies the active branch to a new session file while retaining its parent.
- [src/parent.ts](src/parent.ts): bounded read-only parent-header validation and exact-ID lookup.
- [src/startup.ts](src/startup.ts): startup flag validation and isolated Pi host hook.
- [src/auto-title/index.ts](src/auto-title/index.ts): naming event adapter and command callback.
- [src/auto-title/config.ts](src/auto-title/config.ts): global and trusted project naming settings.
- [src/auto-title/source.ts](src/auto-title/source.ts), [generate.ts](src/auto-title/generate.ts), and [runtime.ts](src/auto-title/runtime.ts): text selection, generation, cancellation, and guarded updates.
- [validation/](validation/): offline Pi runtime and installed-process checks with fixture providers.

## Constraints

- Keep naming separate from session-operation locking and idle checks; regeneration supersedes previous generation and clearing cancels immediately.
- Require `ctx.isIdle()` before persistence or child creation; warn and return immediately when busy rather than waiting. For a busy child command, suggest a shell-quoted CLI invocation only if the current parent file exists.
- Preserve branch entry IDs and parent links; give persisted snapshots a fresh session ID. Preserve Pi's session-wide name or clearing even when its latest metadata is outside the active branch.
- Use `withSession` for post-switch UI work. Do not use a stale extension context after successful replacement.
- Preserve saved files after switch errors, including errors after replacement. Clean up only on explicit cancellation.
- Do not open parent files with `SessionManager.open()` during lookup: opening can migrate their contents.
- Keep startup host assumptions in `startup.ts`. Use [OwnedHooks](../../libs/src/owned-hooks/README.md); apply the CLI flag once per process, before prompts or protocol output.
- Preserve [naming configuration rules](README.md#configuration); reject invalid settings before requests, without affecting persistence or child creation. Never fall back to the active model.
- Use Pi's authentication, thinking APIs, session-name metadata, and notifications. Do not duplicate provider-specific reasoning mappings, send conversation messages, or write custom stdout.
- Reuse [LatestTask](../../libs/src/latest-task/README.md) for stale-result protection and [terminal-text](../../libs/src/tui/terminal-text/README.md) for terminal safety and Unicode-safe boundaries. Cancel underlying I/O separately.

## Validation

Use [package validation](README.md#validation), the [coverage specification](docs/testing.md), and the [Pi compatibility checklist](docs/pi-compatibility.md). Keep model tests offline and select fixture models explicitly rather than relying on host default-model discovery.
