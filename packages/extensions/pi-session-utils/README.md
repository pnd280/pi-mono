# pi-session-utils

Conversations started with `--no-session` are lost when Pi exits, and Pi has no built-in way to start an empty session linked to the current one. This extension adds `/sesh` commands for both gaps, plus optional automatic session naming.

In a conversation started with `pi --no-session`, wait until the agent is idle, then save it:

```text
/sesh persist
```

## Usage

| Command                    | Action                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `/sesh persist`            | Save the active branch of an unsaved session, and switch to the new saved session. |
| `/sesh create-empty-child` | Switch to an empty session whose parent is the current session.                    |
| `/sesh auto-name`          | Generate a new session title from the current branch.                              |
| `/sesh auto-name clear`    | Clear the title, even when naming isn't configured.                                |

To name a session by hand, use Pi's native `/name My session`.

An _ephemeral_ session is one that isn't saved to a file, such as one started with `--no-session`.

### Session operations

`persist` copies the active branch of an ephemeral session into a new file, with a new session ID, and switches to it. `create-empty-child` switches to an empty session that records the current saved session as its parent; for an ephemeral session, run `persist` first. Both commands work only while the agent is idle. If it's busy they fail straight away instead of queueing.

### Automatic session names

Naming needs [configuration](#configuration); saving and child sessions don't. An unnamed session then gets one silent naming attempt per load, when a user message with non-empty text arrives. `/sesh auto-name` generates a new title at any time, even while the agent is running. Setting or clearing a name yourself stops automatic naming.

Naming sends at most 4,000 characters of user and assistant text from the current branch to the chosen model, and titles are at most 80 characters. Images, tool output, and thinking are never sent.

### Start a child from the CLI

With the extension loaded:

```sh
pi --parent-session /path/to/parent.jsonl
pi --parent-session SESSION_ID
pi --no-session --parent-session /path/to/parent.jsonl
```

The child starts empty, in the launch directory. With `--no-session` the child is ephemeral; saving it later with `/sesh persist` keeps its parent link.

| When you…                                                                            | Read                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Want the exact rules for `persist` and `create-empty-child`, or a busy agent         | [Session operations](docs/sessions.md)                       |
| Pass a parent by ID, or combine `--parent-session` with other session options        | [Parent lookup](docs/sessions.md#parent-lookup-from-the-cli) |
| Use a custom session directory                                                       | [Session directories](docs/sessions.md#session-directories)  |
| Want to know what text is sent, what cancels naming, or use print, JSON, or RPC mode | [Automatic naming](docs/naming.md)                           |

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

Put the key in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json` when set), or in `<cwd>/.pi/settings.json` of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). Parent directories aren't searched.

- A trusted project's fields override the global fields.
- Fields that a project leaves out are inherited from the global settings.
- Both fields are required after merging. There are no defaults, no environment variables, and no fallback to the active model.
- Run `/reload` to apply changes.
- Invalid settings turn off naming, but not saving or child sessions. [Settings errors](docs/naming.md#settings-errors) lists what counts as invalid.

To turn off naming only, remove `auto-title` from the global settings and from the settings of every project that sets it, then reload. To turn off the whole extension, use Pi's [extension configuration](https://pi.dev/docs/latest/packages#select-package-resources).

## Side effects

- `persist` writes one JSONL file with the active branch, including prompts, tool results, and extension data. Cancelling removes the new file; if the switch fails, the file is kept so you can recover it.
- Child sessions record the parent's path without modifying the parent file.
- `--parent-session` temporarily patches Pi in memory; see [Pi compatibility](docs/pi-compatibility.md).
- Saving and child sessions make no model or network requests.
- When configured, naming sends [selected conversation text](docs/naming.md#what-is-sent) to the chosen model, which may cost money. It writes only Pi's session-name metadata, never conversation messages or settings.

## Validation

The package tests use offline fixture providers, so they need no credentials and make no paid requests. See [testing](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md).
