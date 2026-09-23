# pi-session-utils

Persist ephemeral Pi conversations and start empty sub-sessions linked to an existing parent.

## Usage

| Command                    | Action                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `/sesh persist`            | Save the active branch of an ephemeral session and switch to the new file-backed session. |
| `/sesh create-empty-child` | Switch to an empty session whose parent is the current session.                           |

Both commands require an idle agent; busy calls warn and return without waiting, queuing work, or changing the session. A busy `create-empty-child` suggests a quoted `pi --parent-session` command for another terminal running a POSIX shell with this extension loaded. If the parent file does not exist, it explains how to save it first.

`persist` copies the current branch's messages and entries, keeps any parent link, and gives the saved session a new ID. Abandoned branches are not copied. Already file-backed sessions are unchanged.

`create-empty-child` copies no conversation or session name. Its parent link is Pi metadata, not model context. Run `persist` first if the current session is ephemeral. For a file-backed session, the parent file must already exist; Pi normally writes it after the first assistant response. The child uses the current working directory and Pi's new-session defaults. Use Pi's `/clone` or `/fork` to copy history instead.

### Start a child from the CLI

With the extension loaded:

```sh
pi --parent-session /path/to/parent.jsonl
pi --parent-session SESSION_ID
pi --no-session --parent-session /path/to/parent.jsonl
```

Paths resolve from the launch directory and support `~/`. Exact IDs, not prefixes, are searched across Pi's default session directories and the active custom session directory. Missing or ambiguous IDs fail startup; use a path for a parent elsewhere. Parent files must have a valid Pi header within the first 1 MiB. Parent lookup is read-only.

The new session is empty and retains the launch working directory, even when the parent belongs to another project. `--no-session` keeps the child ephemeral; a later `/sesh persist` keeps its parent link.

`--parent-session` cannot be combined with `--continue`/`-c`, `--resume`/`-r`, `--session`, `--session-id`, or `--fork`. It applies only at process startup, never again on reload or session replacement. Pi selects sessions before loading extensions, so conflicting options may open or migrate a session, or show the `--resume` picker, before the extension can reject them.

## Configuration

No settings or extension-specific environment variables.

File-backed sub-sessions use Pi's current session directory. `/sesh persist` uses Pi's default session directory for the working directory. An in-memory manager does not retain the custom session-directory preference, so persistence cannot inherit it. CLI parent lookup still honors explicit `--session-dir` and `PI_CODING_AGENT_SESSION_DIR` for an ephemeral child; use a path if its parent is in a settings-only custom directory.

## Side effects

`persist` writes one JSONL file containing the active branch, including prompts, tool results, and extension data. Cancellation removes the newly written file; a switch error leaves it available for recovery. Sub-session creation records a parent-file path without modifying the parent file. Pi writes file-backed children normally; ephemeral children stay in memory until `/sesh persist`.

The startup flag temporarily hooks Pi's session-context construction to update a fresh header before prompts and JSON output. See [Pi compatibility](docs/pi-compatibility.md). No model or network requests are initiated by this extension.

## Validation

[Coverage specification](docs/testing.md).

```sh
vpr 'pi-session-utils#check'
vpr 'pi-session-utils#test'
```

Tests include offline installed-Pi processes for startup flags, JSON headers, reloads, and subsequent session replacement.
