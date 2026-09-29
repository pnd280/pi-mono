# [pi-session-utils](README.md) development

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

Run [package validation](README.md#validation) using offline fixture models. For changed host assumptions use [compatibility](docs/pi-compatibility.md); for contract boundaries use [testing](docs/testing.md).
