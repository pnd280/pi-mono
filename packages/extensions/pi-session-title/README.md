# pi-session-title

Automatically names Pi sessions from user requests; `/auto-name` regenerates titles as conversations change.

## Usage

After [configuration](#configuration), an unnamed session gets at most one automatic attempt per load when a user message arrives and nonempty user text is available, without notifications. Loading/reloading permits another attempt but waits for the next user message.

| Command            | Action                                          |
| ------------------ | ----------------------------------------------- |
| `/auto-name`       | Regenerate from the current branch.             |
| `/auto-name clear` | Clear the name even with invalid configuration. |
| `/name My session` | Set a name with Pi's interactive command.       |

Generation times out after 15 seconds without retrying and requests at most 1,024 answer tokens (or the model's lower limit); failure preserves the name. Configured reasoning can add provider-specific token usage. `/auto-name` reports progress/results through Pi notifications in interactive and RPC modes.

Setting/clearing a name through Pi cancels generation and suppresses automatic naming until session load/reload. Tree navigation cancels generation without changing the name or allowing another automatic attempt; use `/auto-name` for the selected branch.

### Source text

| Trigger      | Current-branch text sent to the model                                  |
| ------------ | ---------------------------------------------------------------------- |
| Automatic    | First 4,000 characters of the first nonempty user request.             |
| `/auto-name` | Newest 4,000 characters of user/assistant text in chronological order. |

Images, tool output, and thinking are excluded. Titles are limited to 80 characters.

### Non-interactive modes

Print, JSON, and RPC support naming. Print/JSON do not wait for automatic naming on exit, so titles may be unsaved. JSON/RPC emit normal Pi session-name events; no custom stdout is written.

## Configuration

Set the literal top-level `ext.pi-session-title` key in global or trusted project [settings.json](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md), using a model available through Pi:

```json
{
  "ext.pi-session-title": {
    "model": "provider/model-id",
    "thinkingLevel": "off"
  }
}
```

`thinkingLevel`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Unsupported levels are rejected, not adjusted. Authentication uses Pi's provider configuration.

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; no ancestor search.                                 |

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) override global fields; omitted fields inherit. Both fields are required after merging. No defaults, extension-specific environment variables, or active-model fallback.

Unreadable/malformed global or trusted project files disable generation. Each participating settings file is limited to 1 MiB before parsing, including unknown fields. Invalid values or unknown keys in either extension section disable it even if the other file is valid. `/auto-name` exposes errors suppressed by automatic naming.

Apply settings with `/reload`; disable through Pi's [extension configuration](../../../node_modules/@earendil-works/pi-coding-agent/docs/packages.md#select-package-resources).

## Side effects

Sends [selected text](#source-text) to the configured model, potentially incurring charges. `/auto-name`, session loading, and exit cancel pending generation. Provider/authentication work may ignore cancellation, but stale results cannot change the name.

Persists only Pi session-name metadata; adds no conversation messages and never writes settings.

## Validation

Run [focused checks](../../../docs/development.md#focused-validation) for `pi-session-title`:

```sh
vpr 'pi-session-title#check'
vpr 'pi-session-title#test'
```

Pi host/process tests use offline fixture providers without credentials or paid requests.
