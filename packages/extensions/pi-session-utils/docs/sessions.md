# Session operations

[pi-session-utils](../README.md) · [Automatic naming](naming.md)

## Save an unsaved session

`/sesh persist` saves the active branch of an ephemeral session, one that isn't saved to a file, and switches to the new saved session.

- It copies the active branch into a new file, with a new session ID.
- It keeps the branch's parent link, the session-wide name, and the labels of the copied entries, including a cleared name or label.
- It does nothing for sessions that are already saved.
- It cancels pending title generation before it copies the branch. If the switch is cancelled, run `/sesh auto-name` to generate a title.

Edge cases: Pi runs other extensions' `session_before_switch` handlers after the copy, and one that waits delays the switch. Prompts, replies, and `/sesh auto-name` titles from that delay change only the session being replaced, so the saved session lacks them.

## Create an empty child

`/sesh create-empty-child` switches to an empty session whose parent is the current session.

- It copies neither the conversation nor the name. The parent link is metadata only; the model doesn't see it.
- It needs the parent saved to a file. Run `persist` first for an ephemeral session. Pi writes a session file only after the first user or assistant message, so a session with only setup may not have one yet.
- To copy history instead, use `/clone` or `/fork`.

## Busy agent

`persist` and `create-empty-child` fail straight away when the agent is busy, instead of queueing.

- If the parent file exists, `create-empty-child` may suggest running `pi --parent-session` in another terminal.
- When the parent path contains control characters, it asks you to retry once idle, rather than offering a command that would be unsafe to copy.
- On native Windows it also asks you to retry once idle, because the suggested command uses POSIX shell quoting.

## Parent lookup from the CLI

`--parent-session` accepts a path or an exact session ID.

- Paths resolve from the launch directory, and `~/` is supported.
- IDs must be exact, not prefixes. The extension looks them up in Pi's default session directories and the active custom session directory.
- A missing ID stops startup. So does an ID that several session files share, as after Pi's `/import` copies a session file without changing its ID. Pi's own `--session` takes the first match instead. For a parent elsewhere, or to pick one of several files, pass its path.
- Lookup never modifies parent files.
- The child starts empty, in the launch directory, even when the parent belongs to another project.
- With `--no-session` the child is ephemeral. Saving it later with `/sesh persist` keeps its parent link.
- `--parent-session` can't be combined with `--continue` (`-c`), `--resume` (`-r`), `--session`, `--session-id`, or `--fork`.

Edge cases: Pi picks the session before extensions load. An option that conflicts with `--parent-session` may therefore still open or migrate a session, or show the `--resume` picker, before it's rejected.

## Session directories

- Saved child sessions go in Pi's current session directory.
- `/sesh persist` uses the default directory for the working directory, even when the ephemeral session was started with a custom directory.
- For ephemeral children, CLI parent lookup honours `--session-dir` and `PI_CODING_AGENT_SESSION_DIR`. For a parent in a custom directory set only in settings, pass its path.
