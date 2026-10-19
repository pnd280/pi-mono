# Session operations

[pi-session-utils](../README.md) · [Automatic naming](naming.md)

## Busy agent

`persist` and `create-empty-child` fail straight away when the agent is busy, instead of queueing.

- If the parent file exists, `create-empty-child` may suggest running `pi --parent-session` in another terminal.
- When the parent path contains control characters, it asks you to retry once idle instead, rather than offering a command that would be unsafe to copy.
- On native Windows it also asks you to retry once idle, because the suggested command uses POSIX shell quoting.

## Parent lookup from the CLI

`--parent-session` accepts a path or an exact session ID.

- Paths resolve from the launch directory, and `~/` is supported.
- IDs must be exact, not prefixes. They're looked up in Pi's default session directories and the active custom session directory.
- A missing or ambiguous ID stops startup. For a parent elsewhere, pass its path.
- Lookup never modifies parent files.
- The child starts empty, in the launch directory, even when the parent belongs to another project.

Edge cases: Pi picks the session before extensions load. An option that conflicts with `--parent-session` may therefore still open or migrate a session, or show the `--resume` picker, before it's rejected.

## Session directories

- Saved child sessions go in Pi's current session directory.
- `/sesh persist` uses the default directory for the working directory, even when the ephemeral session was started with a custom directory.
- For ephemeral children, CLI parent lookup honours `--session-dir` and `PI_CODING_AGENT_SESSION_DIR`. For a parent in a custom directory set only in settings, pass its path.
