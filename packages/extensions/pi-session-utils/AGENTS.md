# [pi-session-utils](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): extension command and flag registration.
- [src/commands.ts](src/commands.ts): `/sesh` dispatch and session-switch lifecycle.
- [src/persist.ts](src/persist.ts): copies the active branch to a new session file, retaining its parent.
- [src/parent.ts](src/parent.ts): bounded read-only parent-header validation and exact-ID lookup.
- [src/startup.ts](src/startup.ts): startup flag validation and isolated Pi host hook.
- [validation/](validation/): real Pi runtime and installed-process checks without provider calls.

## Constraints

- Require `ctx.isIdle()` before either session operation; warn and return immediately when busy rather than waiting. For a busy child command, suggest a shell-quoted CLI invocation only if the current parent file exists.
- Preserve branch entry IDs and parent links; give persisted snapshots a fresh session ID.
- Use `withSession` for post-switch UI work. Do not use a stale extension context after successful replacement.
- Preserve saved files after switch errors, which can occur after replacement. Clean up only on explicit cancellation.
- Do not open parent files with `SessionManager.open()` during lookup: opening can migrate their contents.
- Keep startup host assumptions in `startup.ts`. Use [OwnedHooks](../../libs/src/owned-hooks/README.md) and apply the CLI flag only once per process, before prompts or protocol output.

## Validation

Use [package validation](README.md#validation), the [coverage specification](docs/testing.md), and the [Pi compatibility checklist](docs/pi-compatibility.md).
