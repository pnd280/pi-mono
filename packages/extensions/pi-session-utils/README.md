# pi-session-utils

Persist ephemeral Pi conversations, start empty parent-linked sub-sessions, and optionally generate session names with a configured model.

## Usage

| Command                    | Action                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `/sesh persist`            | Save the active branch of an ephemeral session and switch to the new file-backed session. |
| `/sesh create-empty-child` | Switch to an empty session whose parent is the current session.                           |
| `/sesh auto-name`          | Regenerate the session title from the current branch.                                     |
| `/sesh auto-name clear`    | Clear the title even without valid naming configuration.                                  |

Use Pi's native `/name My session` to set a name manually.

### Session operations

`persist` and `create-empty-child` require an idle agent and allow only one session operation at a time. Busy calls warn and return without waiting, queuing work, or changing the session. A busy `create-empty-child` suggests a quoted `pi --parent-session` command for another terminal running a POSIX shell with this extension loaded. If the parent file does not exist, it explains how to save it first. Paths containing control characters receive idle-retry guidance instead of a copyable command; sanitizing that command could select a different file.

`persist` copies the current branch's messages and entries, keeps any parent link and the current session name (including a cleared name), and gives the saved session a new ID. Name changes made on another branch are retained without copying that branch's conversation. Already file-backed sessions are unchanged.

`create-empty-child` copies no conversation or session name. Its parent link is Pi metadata, not model context. Run `persist` first if the current session is ephemeral. For a file-backed session, the parent file must already exist; Pi normally writes it after the first assistant response. The child uses the current working directory and Pi's new-session defaults. Use Pi's `/clone` or `/fork` to copy history instead.

### Automatic session names

Naming requires [configuration](#configuration); persistence and child creation do not. An unnamed session gets at most one automatic attempt per load when a user message arrives and nonempty user text is available, without notifications. Loading/reloading permits another attempt but waits for the next user message.

`/sesh auto-name` and `clear` work while the agent is running, independently of the session-operation lock. Regeneration cancels previous generation; clearing cancels it immediately. Setting/clearing a name through Pi also cancels generation and suppresses automatic naming until session load/reload. Tree navigation cancels generation without changing the name or allowing another automatic attempt; use `/sesh auto-name` for the selected branch.

Generation times out after 15 seconds without retrying and requests at most 1,024 answer tokens (or the model's lower limit); failure preserves the name. Configured reasoning can add provider-specific token usage. `/sesh auto-name` reports progress/results through Pi notifications in interactive and RPC modes.

| Trigger           | Current-branch text sent to the model                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Automatic         | First 4,000 characters of the first nonempty user request.             |
| `/sesh auto-name` | Newest 4,000 characters of user/assistant text in chronological order. |

Images, tool output, and thinking are excluded. Titles are limited to 80 characters.

Print, JSON, and RPC support naming. Print/JSON do not wait for automatic naming on exit, so titles may be unsaved. JSON/RPC emit normal Pi session-name events; no custom stdout is written.

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

To enable naming, set `auto-title` inside the literal top-level `ext.pi-session-utils` key in global or trusted project [settings.json](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md), using a model available through Pi:

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

`thinkingLevel`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Unsupported levels are rejected, not adjusted. Authentication uses Pi's provider configuration.

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; no ancestor search.                                 |

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) override global naming fields; omitted fields inherit. Both fields are required after merging. No defaults, extension-specific environment variables, or active-model fallback.

Unreadable/malformed global or trusted project files disable generation, not persistence or child creation. Each participating settings file is limited to 1 MiB before parsing, including unknown fields. Invalid values or unknown keys in either `ext.pi-session-utils` or its `auto-title` section disable naming even if the other file is valid. `/sesh auto-name` exposes errors suppressed by automatic naming; clearing remains available.

Apply settings with `/reload`. To disable naming alone, remove `auto-title` from global and participating project settings and reload. To disable the entire extension, use Pi's [extension configuration](../../../node_modules/@earendil-works/pi-coding-agent/docs/packages.md#select-package-resources).

File-backed sub-sessions use Pi's current session directory. `/sesh persist` uses Pi's default session directory for the working directory. An in-memory manager does not retain the custom session-directory preference, so persistence cannot inherit it. CLI parent lookup still honors explicit `--session-dir` and `PI_CODING_AGENT_SESSION_DIR` for an ephemeral child; use a path if its parent is in a settings-only custom directory.

## Side effects

`persist` writes one JSONL file containing the active branch, including prompts, tool results, and extension data. Cancellation removes the newly written file; a switch error leaves it available for recovery. Sub-session creation records a parent-file path without modifying the parent file. Pi writes file-backed children normally; ephemeral children stay in memory until `/sesh persist`.

The startup flag temporarily hooks Pi's session-context construction to update a fresh header before prompts and JSON output. See [Pi compatibility](docs/pi-compatibility.md). Persistence and child creation initiate no model or network requests.

Configured naming sends the [selected conversation text](#automatic-session-names) to the chosen model, potentially incurring charges. Regeneration, session replacement/loading, and exit cancel pending generation. Provider/authentication work may ignore cancellation, but stale results cannot change the name. Naming persists only Pi session-name metadata; it adds no conversation messages and never writes settings.

## Validation

[Coverage specification](docs/testing.md).

```sh
vpr 'pi-session-utils#check'
vpr 'pi-session-utils#test'
```

Tests include offline Pi hosts and installed processes for naming, startup flags, JSON headers/output, reloads, and subsequent session replacement. Fixture providers require no credentials or paid requests.
