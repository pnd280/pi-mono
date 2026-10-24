# [pi-session-utils](README.md) development

Keep naming separate from the locking and idle checks of session operations.

## Must not regress

- Keep saved files after switch errors, including errors after replacement. Clean up only on explicit cancellation.
- During parent lookup, read only session headers. Never open parent files with `SessionManager.open()`; opening can migrate their contents.
- Reject invalid naming settings before any request, without affecting session operations. Never fall back to the active model. See [configuration](README.md#configuration).

## Session operations

- Keep branch entry IDs and parent links. Give saved snapshots a new session ID.
- Keep Pi's session-wide name, or its clearing, even when the latest name metadata is outside the active branch.
- After a switch or replacement, do UI work through the fresh `withSession` context. Never use a stale extension context after a successful replacement.
- For a busy child command, suggest a shell-quoted CLI command only if the current parent file exists and its path is safe to copy.

## Startup

- Keep host assumptions for startup in `startup.ts`.
- Use [OwnedHooks](../../libs/src/owned-hooks/README.md), so startup hooks are restored only while this extension owns them. Apply the CLI flag once per process, before prompts or protocol output.

## Naming

- Use Pi's authentication and session-name metadata. Never send conversation messages or write custom stdout.
- Abort the underlying I/O of a superseded or cancelled title request, and discard its result.
- Save an automatic title only after its agent run settles without an abort. The [compatibility checklist](docs/pi-compatibility.md#naming) gives the reason.
- Cancel title work for tree navigation in `session_tree`, not `session_before_tree`: another extension's handler can cancel the navigation after this one runs.
- Stop title work at shutdown only in the [lifecycle](../../libs/src/lifecycle/README.md) shutdown revoke, which runs before any participant awaits. A direct `session_shutdown` handler can run after another extension's await, and a finished generation could still save its title.
- Use [terminal-text](../../libs/src/tui/terminal-text/README.md) for terminal safety and Unicode-safe boundaries.

## Validation

| When you…                | Read or run                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Run checks               | The [package checks](../../../docs/development.md#focused-validation). They use offline fixture models. |
| Change a host assumption | The [compatibility checklist](docs/pi-compatibility.md).                                                |
| Choose tests             | The [coverage specification](docs/testing.md).                                                          |
