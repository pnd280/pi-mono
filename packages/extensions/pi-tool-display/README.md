# pi-tool-display

Replaces Pi's default tool-call output with compact cards, so long agent runs stay readable. Once a run of tool calls finishes, it collapses to one line:

```text
  Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file
```

Click the line to see the cards again. Cards use the active theme and syntax highlighter, show live shell previews, and show [file diffs](docs/presentation.md#diff-viewer) for edits and writes.

## Usage

Pi's expansion key (default **Ctrl+O**) cycles through three display modes: `summary` → `compact` → `verbose` → `summary`.

| Mode                | What you see                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `summary` (default) | Each finished run becomes [one summary line](docs/presentation.md#summary-mode). Runs still in progress show compact cards. |
| `compact`           | One card per call, with bounded [result previews](docs/presentation.md#results). Related calls share an exploration group.  |
| `verbose`           | Every card expanded, plus Pi's startup header and loaded resources. Pi's `--verbose` flag starts here.                      |

A _run_ contains this extension's consecutive calls between visible non-thinking boundaries, such as assistant prose, an unrelated notice, or a tool with its original renderer.

An _exploration group_ combines adjacent calls with the same directory or literal-filter scope under one heading, such as "Explored src/".

Compact cards keep diagnostics and images beneath their call when successful text is hidden. A closed summary hides those cards, including their diagnostics and images; open the run to inspect them.

### Mouse and terminal modes

Summary lines need Pi's fullscreen mode. In regular mode, `summary` renders as `compact`, and **Ctrl+O** toggles between `compact` and `verbose`.

In fullscreen, clicking a card, group, or summary line expands it. Clicking the horizontal rule above or below an opened run collapses it again. Regular mode leaves mouse input to the terminal.

In fullscreen, click a subagent card or background result with a task ID to open its transcript. pi-subagents checks that the card is current and that it owns the task. Use **Ctrl+O** to expand its details.

### Assistant text and thinking

Assistant prose starts with a `•` marker. When thinking is collapsed (default **Ctrl+T**), finished thinking blocks are hidden. See [thinking](docs/presentation.md#thinking) for details.

### Known limits

- Transcript search cannot find output hidden inside a summary line, including image and failure details, until you open the run.
- Switching modes does not keep the scroll position.
- Custom cards do not appear in HTML exports.

## Supported tools

These tools get dedicated cards:

- Pi's [native tools](src/adapters/native/README.md): read, bash, PowerShell, edit, write, and the search and listing tools.
- Pi's built-in [codemode](src/adapters/builtin/codemode/README.md), [MCP](src/adapters/builtin/mcp/README.md), and [tool search](src/adapters/builtin/tool-search/README.md).
- Extensions: [FFF](src/adapters/@ff-labs/pi-fff/README.md), [MCP adapter](src/adapters/pi-mcp-adapter/README.md), [todo](src/adapters/pi-todo/README.md), [selective read](src/adapters/pi-read/README.md), [smart compact](src/adapters/pi-smart-compact/README.md), and [subagents](src/adapters/pi-subagents/README.md).
- [Nested-instruction notices](src/adapters/pi-nested-instructions/README.md), which also count toward run summaries.
- [Subagent background results](src/adapters/pi-subagents/README.md#background-results).

A dedicated card replaces any renderer the tool supplies. Other tools keep their own renderer if they have one, including renderers that extensions supply through `registerToolRenderer`; otherwise they get a generic card. Calls to tools that are not loaded, such as old calls or MCP calls before the server reconnects, get a generic card. It switches to the dedicated card if the tool registers later.

## Configuration

Settings live under the literal key `ext.pi-tool-display` in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Trusted projects can override them in `.pi/settings.json`.

```json
{
  "ext.pi-tool-display": {
    "collapsedMode": "summary",
    "showParameters": false,
    "rendererOverrides": {
      "search_docs": "generic",
      "bash": "original"
    }
  }
}
```

| Setting             | Values                                    | Effect                                                                                                                          |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `collapsedMode`     | `summary` (default), `compact`            | Starting mode, and the mode that collapsing from `verbose` returns to.                                                          |
| `showParameters`    | `false` (default), `true`                 | Shows optional details on dedicated cards. Structured blocks still need expansion. MCP and generic cards always show arguments. |
| `rendererOverrides` | tool name → `auto`, `generic`, `original` | Per-tool rendering choice; see below.                                                                                           |

`rendererOverrides` matches exact tool names:

- `auto` uses [automatic selection](docs/adapters.md#automatic-selection). In a project file, it also resets an override inherited from global settings.
- `generic` shows the tool's data on a generic card and turns off this extension's observation of it.
- `original` leaves the tool's rendering, grouping, and observation entirely to Pi. Other extensions may still observe it.

Mode changes made with **Ctrl+O** last through `/reload` and session switches in the same process, without writing settings. A new process starts from `collapsedMode` (or `--verbose`). These settings do not change tool execution or saved arguments.

Trusted project settings merge over global settings key by key. Untrusted project settings are ignored.

> Any invalid applicable section, even one a later file overrides, restores original tool rendering and stops native observation. Message cards for nested instructions and subagent background results remain registered. The terminal warning names the file and key. Fix the setting, then run `/reload`.

The extension has no environment variables or CLI flags, and never writes settings.

## Side effects

The extension observes live tool calls and replays recorded facts. Neither changes tool execution.

Warnings appear as Pi notifications in TUI and RPC sessions. Print and JSON sessions write them to stderr. Warnings during a TUI quit go to stderr when Pi exits, because the terminal display has already stopped.

### What is recorded

In TUI, RPC, print, and JSON sessions, the extension observes verified Pi-native `bash`, `powershell`, `edit`, and `write` calls. It collects shell previews, timing, outcomes, and file contents from before each write. These observations are shared with `pi-agent-summary` through [file observations](../../libs/src/file-mutations/README.md), so files are not read twice. Another process writing the same file can race with the observation. Display failures never change a tool's outcome.

Session history stores only facts that Pi's own entries lack: cancellation, a shell exit code or timeout when the call did not succeed, a change applied although Pi reported failure, an operation failure that Pi's result or call cancellation cannot preserve, and bounded patches. When collection stops before Pi saves a call's result, such as at shutdown, the observed outcome and exit code are saved, because replay cannot rely on that result. They are kept in `pi-tool-display.call` custom entries, outside the model's context. A `pi-tool-display.writer` entry names the local file for subsequent saved call facts and results, and the directory where those calls ran. `write` saves its patch only when replay cannot derive the same patch from the written content. `edit` diffs come from Pi's result: the extension saves its own diff when the edit did not succeed, ended without a result, or Pi's patch is missing, invalid, or has different hunks.

Timing, saved-output references, and diagnostics stay on this machine, in `pi-tool-display/calls/<writer>.jsonl` under Pi's agent directory. A file is created when collection starts, including after a reload. Folders and files are owner-only, and linked files are refused. A failed write or close of this file shows a warning, also during shutdown. The extension never deletes these files, because copied or moved sessions can still name them. Sessions that Pi does not save keep these details in memory. Live shell previews stay in memory only.

> **Patches can keep deleted text.** Removed and context lines from overwritten files may remain in session history.

Native observation excludes SDK tool overrides, custom tools, and manual `!` and `!!` commands. Verified extension adapters can still contribute call provenance and summaries.

### Replay and saved output

Reopening a session restores matching facts for calls on the selected branch without rerunning tools or observing source files again. Published results still supply their outcomes. Replay finds local details through the nearest writer entry before a call's saved facts or result, so forks and copies keep them on the same machine. When that file is not on this machine, shell cards show `Timing not on this machine`, and expanded cards say that local details are missing. Missing facts are never guessed from output text. See [outcomes](docs/presentation.md#outcomes).

Expanding a finished shell card reads a bounded preview from Pi's temporary output file. See [saved-output previews](docs/presentation.md#saved-output-previews) for loading and retry. The extension keeps no durable output archive and makes no network requests.

[Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches. Large, binary, or unavailable changes never block a native operation.

## Compatibility

Automatic integration depends on Pi's private TUI contracts. See the [compatibility checklist](docs/pi-compatibility.md) for the verified version and coverage limits.

Unavailable host contracts disable the affected features:

| Missing contract       | Fallback                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Native observation     | Observation stops; operation and change facts replay only with the native adapter. |
| Assistant presentation | Assistant text renders natively.                                                   |
| Summary rows           | `summary` renders as `compact`.                                                    |
| Mode cycle             | **Ctrl+O** toggles only between collapsed and `verbose`.                           |

The extension registers no tools, changes no active tools, and adds no keybindings; the mode cycle reuses Pi's expansion action.

## For tool authors

To give your own tool a custom card, use the [standalone renderer API](docs/renderers.md). Automatic integration needs an [adapter resolver](docs/adapters.md#add-an-adapter) in this package.

## Validation

| When you…                             | Read                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| change tested behaviour               | [Coverage specification](docs/testing.md)                             |
| run package checks                    | [Focused validation](../../../docs/development.md#focused-validation) |
| check clicks, keys, or layout by hand | [Terminal checks](docs/validation.md)                                 |
