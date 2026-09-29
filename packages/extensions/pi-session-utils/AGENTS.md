# [pi-session-utils](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): extension command and flag registration.
- [src/commands.ts](src/commands.ts): `/sesh` dispatch and session-switch lifecycle.
- [src/persist.ts](src/persist.ts): copies the active branch to a new session file while retaining its parent.
- [src/parent.ts](src/parent.ts): bounded read-only parent-header validation and exact-ID lookup.
- [src/startup.ts](src/startup.ts): startup flag validation and isolated Pi host hook.
- [src/auto-title/index.ts](src/auto-title/index.ts): naming event adapter and command callback.
- [src/auto-title/config.ts](src/auto-title/config.ts): global and trusted project naming settings.
- [src/auto-title/source.ts](src/auto-title/source.ts), [generate.ts](src/auto-title/generate.ts), and [runtime.ts](src/auto-title/runtime.ts): naming source, requests, and cancellation.
- [validation/](validation/): offline Pi runtime and installed-process checks with fixture providers.

## Constraints

- Keep naming separate from session-operation locking and idle checks. For a busy child command, suggest a shell-quoted CLI invocation only if the current parent file exists and the path is safe to copy.
- Preserve branch entry IDs and parent links; give persisted snapshots a fresh session ID. Preserve Pi's session-wide name or clearing even when its latest metadata is outside the active branch.
- Use `withSession` for post-switch UI work. Do not use a stale extension context after successful replacement.
- Preserve saved files after switch errors, including errors after replacement. Clean up only on explicit cancellation.
- Do not open parent files with `SessionManager.open()` during lookup: opening can migrate their contents.
- Keep startup host assumptions in `startup.ts`. Use [OwnedHooks](../../libs/src/owned-hooks/README.md); apply the CLI flag once per process, before prompts or protocol output.
- Reject invalid naming settings before requests without affecting session operations; never fall back to the active model. See [configuration](README.md#configuration).
- Use Pi's authentication and session-name metadata; do not send conversation messages or custom stdout.
- Reuse [LatestTask](../../libs/src/latest-task/README.md) for stale-result protection and [terminal-text](../../libs/src/tui/terminal-text/README.md) for terminal safety and Unicode-safe boundaries. Cancel underlying I/O separately.

## Validation

Use [package validation](README.md#validation), [coverage specification](docs/testing.md), [Pi compatibility checklist](docs/pi-compatibility.md), and [workspace verification](../../../docs/agents/verification.md). Keep model tests offline with explicit fixture models.
