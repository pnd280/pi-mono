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

`persist` and `create-empty-child` require an idle agent; busy calls do not queue. A busy child command may suggest `pi --parent-session` in another terminal if the parent file exists. For paths with control characters it instead asks you to retry when idle, rather than offering an unsafe copyable command.

`persist` copies the active branch, preserves its parent link and session-wide name (including a cleared name), and assigns a new session ID. Already file-backed sessions are unchanged.

`create-empty-child` copies neither conversation nor name; its parent link is metadata, not model context. Run `persist` first for an ephemeral session; a file-backed parent's file must exist (Pi writes it after the first user or assistant message; setup-only sessions may still be unwritten). Use `/clone` or `/fork` to copy history instead.

### Automatic session names

Naming requires [configuration](#configuration); persistence and child creation do not. An unnamed session gets at most one silent automatic attempt per load when a user message arrives and nonempty user text is available. Loading or reloading permits another attempt but waits for the next user message.

`/sesh auto-name` and `clear` work while the agent runs. Regeneration supersedes previous generation; setting or clearing a name cancels it and suppresses automatic naming until session load or reload. Tree navigation cancels generation without allowing another automatic attempt; use `/sesh auto-name` for the selected branch.

Generation times out after 15 seconds without retrying; failure preserves the name. `/sesh auto-name` reports progress and results through Pi notifications in interactive and RPC modes.

| Trigger           | Current-branch text sent to the model                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Automatic         | First 4,000 characters of the first nonempty user request.             |
| `/sesh auto-name` | Newest 4,000 characters of user/assistant text in chronological order. |

Images, tool output, and thinking are excluded. Titles are limited to 80 characters.

Print, JSON, and RPC support naming. Print/JSON do not wait for automatic naming on exit, so titles may be unsaved.

### Start a child from the CLI

With the extension loaded:

```sh
pi --parent-session /path/to/parent.jsonl
pi --parent-session SESSION_ID
pi --no-session --parent-session /path/to/parent.jsonl
```

Paths resolve from the launch directory and support `~/`. Parent lookup accepts exact IDs, not prefixes, in Pi's default session directories and the active custom session directory. Missing or ambiguous IDs fail startup; use a path for a parent elsewhere. Lookup does not modify parent files.

The child is empty and retains the launch working directory, even for a parent in another project. `--no-session` keeps it ephemeral; a later `/sesh persist` keeps its parent link.

`--parent-session` cannot be combined with `--continue` (`-c`), `--resume` (`-r`), `--session`, `--session-id`, or `--fork`. Pi selects sessions before loading extensions, so conflicting options may open or migrate a session, or show the `--resume` picker, before rejection.

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

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#understand-project-trust) override global naming fields; omitted fields inherit. Both fields are required after merging. No defaults, extension-specific environment variables, or active-model fallback.

Unreadable, malformed, or oversized settings files (over 1 MiB), invalid values, or unknown keys in `ext.pi-session-utils` or `auto-title` disable naming, not persistence or child creation. `/sesh auto-name` reports errors that automatic naming suppresses; clearing remains available.

Apply settings with `/reload`. To disable naming alone, remove `auto-title` from global and participating project settings and reload. To disable the entire extension, use Pi's [extension configuration](../../../node_modules/@earendil-works/pi-coding-agent/docs/packages.md#select-package-resources).

File-backed children use Pi's current session directory. `/sesh persist` uses the default directory for the working directory, even if an in-memory session was launched with a custom directory. CLI parent lookup honors `--session-dir` and `PI_CODING_AGENT_SESSION_DIR` for ephemeral children; use a path for a parent in a settings-only custom directory.

## Side effects

`persist` writes one JSONL file with the active branch, including prompts, tool results, and extension data. Cancellation removes the new file; a switch error leaves it for recovery. Child creation records a parent path without modifying the parent file.

The startup flag temporarily patches Pi in memory; see [Pi compatibility](docs/pi-compatibility.md). Persistence and child creation initiate no model or network requests.

Configured naming sends [selected conversation text](#automatic-session-names) to the chosen model, potentially incurring charges. Naming writes only Pi session-name metadata, not conversation messages or settings.

## Validation

Follow the [workspace checks](../../../docs/development.md#focused-validation), [testing boundaries](docs/testing.md), and [Pi compatibility](docs/pi-compatibility.md). Fixture providers require no credentials or paid requests.
