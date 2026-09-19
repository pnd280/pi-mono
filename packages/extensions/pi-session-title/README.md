# pi-session-title

Automatically names Pi sessions from user requests. Use `/auto-name` to regenerate a title as the conversation changes.

## Usage

After [configuration](#configuration), the extension tries to name an unnamed session when a user message arrives. It needs nonempty user text and makes at most one automatic attempt per session load, without notifications. Loading or reloading an unnamed session permits another attempt, but naming still waits for the next user message.

| Command            | Action                                             |
| ------------------ | -------------------------------------------------- |
| `/auto-name`       | Regenerate the title from the current branch.      |
| `/auto-name clear` | Clear the name, even without valid configuration.  |
| `/name My session` | Set a name manually with Pi's interactive command. |

Generation times out after 15 seconds and does not retry. Failures leave the current name unchanged. `/auto-name` shows progress and results through Pi notifications in interactive and RPC modes.

Setting or clearing a name through Pi cancels pending generation and suppresses automatic naming until the session is loaded or reloaded. Tree navigation also cancels pending generation, but does not change the name or permit another automatic attempt. Run `/auto-name` to regenerate from the selected branch.

### Source text

Titles use text from the current branch:

| Trigger          | Text sent to the model                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| Automatic naming | Up to 4,000 characters from the start of the first nonempty user request.            |
| `/auto-name`     | The newest 4,000 characters of user and assistant text, kept in chronological order. |

Images, tool output, and thinking blocks are excluded. Generated titles are limited to 80 characters.

### Non-interactive modes

Naming also works in print, JSON, and RPC modes. Print and JSON processes do not wait for automatic naming before exiting, so a title may not be saved. JSON and RPC emit Pi's normal session-name events. The extension writes no custom stdout output.

## Configuration

Set `model` and `thinkingLevel` under the top-level `ext.pi-session-title` key in Pi's global or trusted project [settings.json](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md). Replace `provider/model-id` with a model available through Pi:

```json
{
  "ext.pi-session-title": {
    "model": "provider/model-id",
    "thinkingLevel": "off"
  }
}
```

`thinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`, as supported by the chosen model. Unsupported levels are rejected rather than adjusted. Authentication uses Pi's provider configuration.

| Scope   | Settings file                                                                  |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`. Ancestor directories are not searched.              |

Project settings are ignored unless Pi [trusts the project](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md#project-trust). Project fields override global fields, and omitted fields inherit global values.

Both fields are required after merging. There are no defaults or extension-specific environment variables, and the extension never falls back to the active model.

An unreadable or malformed global or trusted project settings file disables generation. Invalid values or unknown keys in either `ext.pi-session-title` section also disable generation, even if the other file supplies valid values. Use `/auto-name` to see errors that automatic naming suppresses.

After editing settings, run `/reload` to apply changes. Disable the extension through Pi's [extension configuration](../../../node_modules/@earendil-works/pi-coding-agent/docs/packages.md#enable-and-disable-resources).

## Side effects

Naming sends the [selected text](#source-text) to the configured model and may incur provider charges.

Running `/auto-name`, loading a session, or exiting Pi cancels pending generation. Provider or authentication work that ignores cancellation may continue, but its result cannot change the name.

The extension persists only the session name in Pi's session metadata. It adds no conversation messages and never writes settings.

## Validation

Run the [focused checks](../../../docs/development.md#focused-validation) for `pi-session-title`:

```sh
vpr 'pi-session-title#check'
vpr 'pi-session-title#test'
```

Tests use offline fixture providers for Pi host and process checks, without credentials or paid requests.
