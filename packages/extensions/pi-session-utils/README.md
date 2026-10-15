# pi-session-utils

Conversations started with `--no-session` are lost when Pi exits, and Pi has no built-in way to start an empty session linked to the current one. This extension adds `/sesh` commands for both gaps, plus optional automatic session naming:

- Save a conversation started with `--no-session` to a file, so you can come back to it.
- Start a fresh, empty session that records the current one as its parent, from inside Pi or with `pi --parent-session`.
- Optionally, name sessions automatically with a model you choose.

## Usage

| Command                    | Action                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `/sesh persist`            | Save the active branch of an unsaved session, and switch to the new saved session. |
| `/sesh create-empty-child` | Switch to an empty session whose parent is the current session.                    |
| `/sesh auto-name`          | Generate a new session title from the current branch.                              |
| `/sesh auto-name clear`    | Clear the title, even when naming isn't configured.                                |

To name a session by hand, use Pi's native `/name My session`.

An _ephemeral_ session is one that isn't saved to a file, such as one started with `--no-session`.

| When you…                                                                | Read                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Run a session command while the agent is busy, or look up a parent by ID | [Session operations](docs/sessions.md)                      |
| Use a custom session directory                                           | [Session directories](docs/sessions.md#session-directories) |
| Want to know what cancels naming, or use print, JSON, or RPC mode        | [Automatic naming](docs/naming.md)                          |

### Session operations

`persist` and `create-empty-child` work only while the agent is idle. If it's busy they fail straight away instead of queueing.

`persist`:

- It copies the active branch into a new file, with a new session ID.
- It keeps the branch's parent link and the session-wide name, including a cleared name.
- It does nothing for sessions that are already saved.

`create-empty-child`:

- It copies neither the conversation nor the name. The parent link is metadata only; the model doesn't see it.
- It needs the parent saved to a file. Run `persist` first for an ephemeral session. Pi writes a session file only after the first user or assistant message, so a session with only setup may not have one yet.
- To copy history instead, use `/clone` or `/fork`.

### Automatic session names

Naming needs [configuration](#configuration); saving and child sessions don't.

- An unnamed session gets at most one automatic attempt per load, made silently when a user message with non-empty text arrives. Loading or reloading allows another attempt, at the next user message.
- `/sesh auto-name` generates a new title at any time, even while the agent is running.
- Setting or clearing a name yourself stops automatic naming until the session is loaded or reloaded. Other events that cancel naming are listed in the [naming guide](docs/naming.md#cancellation-and-retries).
- Generation times out after 15 seconds and isn't retried. If it fails, the name is unchanged.

| Trigger           | Text from the current branch sent to the model                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| Automatic         | The first 4,000 characters of the first non-empty user request.                 |
| `/sesh auto-name` | The newest 4,000 characters of user and assistant text, in chronological order. |

Images, tool output, and thinking are never sent. Titles are at most 80 characters.

### Start a child from the CLI

With the extension loaded:

```sh
pi --parent-session /path/to/parent.jsonl
pi --parent-session SESSION_ID
pi --no-session --parent-session /path/to/parent.jsonl
```

- The child starts empty, in the launch directory. Pass the parent as a path or an exact session ID; [parent lookup](docs/sessions.md#parent-lookup-from-the-cli) explains how both are resolved.
- With `--no-session` the child is ephemeral. Saving it later with `/sesh persist` keeps its parent link.

`--parent-session` can't be combined with `--continue` (`-c`), `--resume` (`-r`), `--session`, `--session-id`, or `--fork`.

## Configuration

To turn on naming, add `auto-title` under an `ext.pi-session-utils` key in global or trusted project [settings.json](https://pi.dev/docs/latest/settings), naming a model available in Pi:

```json
{
  "ext.pi-session-utils": {
    "auto-title": {
      "model": "provider/model-id",
      "thinkingLevel": "off"
    }
  }
}
```

| Field           | Meaning                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `model`         | Model used for naming, as `provider/model-id`. Authentication uses Pi's provider configuration.                            |
| `thinkingLevel` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. A level the model doesn't support is rejected, not adjusted. |

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; parent directories aren't searched.                 |

- Only [trusted projects](https://pi.dev/docs/latest/security#understand-project-trust) can override global fields. Fields a project leaves out are inherited.
- Both fields are required after merging. There are no defaults, no environment variables, and no fallback to the active model.
- Run `/reload` to apply changes.
- Invalid settings turn off naming, but not saving or child sessions. [Settings errors](docs/naming.md#settings-errors) lists what counts as invalid.

To turn off naming only, remove `auto-title` from the global settings and from the settings of every project that sets it, then reload. To turn off the whole extension, use Pi's [extension configuration](https://pi.dev/docs/latest/packages#select-package-resources).

## Side effects

- `persist` writes one JSONL file with the active branch, including prompts, tool results, and extension data. Cancelling removes the new file; if the switch fails, the file is kept so you can recover it.
- Child sessions record the parent's path without modifying the parent file.
- `--parent-session` temporarily patches Pi in memory; see [Pi compatibility](docs/pi-compatibility.md).
- Saving and child sessions make no model or network requests.
- When configured, naming sends [selected conversation text](#automatic-session-names) to the chosen model, which may cost money. It writes only Pi's session-name metadata, never conversation messages or settings.

## Validation

Use the [workspace checks](../../../docs/development.md#focused-validation). Fixture providers need no credentials or paid requests. See [testing](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md).
