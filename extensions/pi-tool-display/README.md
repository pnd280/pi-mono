# pi-tool-display

Long agent runs bury tool results. pi-tool-display replaces Pi's default tool-call output with compact cards. A finished run collapses to one line:

```text
▸ Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file   12 calls
```

Click the line to see the cards again. Cards use the active theme and syntax highlighter, show live shell previews, and show [file diffs](docs/presentation.md#diff-viewer) for edits and writes.

## Usage

Pi's expansion key (default **Ctrl+O**) cycles through three display modes in this order: `summary`, `compact`, `verbose`, then back to `summary`.

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

In fullscreen, clicking a card, group, or summary line expands it. Clicking an opened run's summary line, or the `▴ collapse` bar below its cards, collapses it again. Cards ignore clicks with Shift, Alt, or Ctrl held, so those clicks don't expand, collapse, or open anything. Regular mode leaves mouse input to the terminal.

In fullscreen, click a subagent card or background result with a task ID to open its transcript. Click a job card or job result to open the job. pi-subagents checks that the card is current and that it owns the task or job. Use **Ctrl+O** to expand its details.

### Assistant text and thinking

Assistant prose starts with a `•` marker. When thinking is collapsed (default **Ctrl+T**), finished thinking blocks are hidden. See [thinking](docs/presentation.md#thinking) for details.

### Known limits

- Transcript search cannot find output hidden inside a summary line, including image and failure details, until you open the run.
- Switching modes does not keep the scroll position.
- Custom cards do not appear in HTML exports.

## Supported tools

These tools get dedicated cards:

- Pi's native tools: read, bash, PowerShell, edit, write, and the search and listing tools.
- Pi's built-in codemode, MCP, and tool search.
- Extensions: FFF, the MCP adapter, todo, selective read, smart compact, the tool search of profiles, and subagents, including background jobs.
- Nested-instruction notices, which also count towards run summaries.
- Subagent background results and job results.

[Supported tool cards](docs/tools.md) shows how the calls of each tool appear and what each card needs.

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

| Setting             | Values                                         | Effect                                                                                                                          |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `collapsedMode`     | `summary` (default), `compact`                 | Starting mode, also used when a Pi action collapses `verbose` output. **Ctrl+O** follows the cycle above.                       |
| `showParameters`    | `false` (default), `true`                      | Shows optional details on dedicated cards. Structured blocks still need expansion. MCP and generic cards always show arguments. |
| `rendererOverrides` | `auto`, `generic`, or `original` per tool name | Per-tool rendering choice; see below.                                                                                           |

`rendererOverrides` matches exact tool names:

- `auto` uses [automatic selection](docs/adapters.md#automatic-selection). In a project file, it also resets an override inherited from global settings.
- `generic` shows the tool's data on a generic card and turns off this extension's observation of it.
- `original` leaves the tool's rendering, grouping, and observation entirely to Pi. Other extensions may still observe it.

Mode changes from **Ctrl+O** survive `/reload` and session switches within the process, without writing settings. New processes start from `collapsedMode` (or `--verbose`). Settings leave tool execution and saved arguments unchanged.

Trusted project settings merge over global settings key by key. Untrusted project settings are ignored.

> Any invalid applicable section, even one a later file overrides, restores original tool rendering and stops native observation. Message cards for nested instructions, subagent background results, and job results remain registered. The terminal warning names the file and key. Fix the setting, then run `/reload`.

The extension has no environment variables or CLI flags, and never writes settings.

## Side effects

The extension observes live tool calls and replays recorded facts. Neither changes tool execution, and the extension makes no network requests.

Warnings appear as Pi notifications in TUI and RPC sessions. Print and JSON sessions write them to stderr. Warnings during a TUI quit go to stderr when Pi exits, because the terminal display has already stopped.

### What is recorded

The extension observes verified Pi-native `bash`, `powershell`, `edit`, and `write` calls in TUI, RPC, print, and JSON sessions. Session history keeps only facts that Pi's own entries lack, such as cancellation, a failed shell's exit code, and bounded patches, in `pi-tool-display.call` entries outside the model's context. The extension writes no files of its own, and live shell previews stay in memory only.

> Patches can keep deleted text. Removed and context lines from overwritten files may remain in session history.

Reopening a session restores these facts without rerunning tools or reading source files again. Expanding a finished shell card reads a bounded preview of Pi's temporary output file. [Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches. Large, binary, or unavailable changes never block a native operation.

| When you…                                                    | Read                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| want the exact facts saved, the exclusions, and replay rules | [Recorded data and replay](docs/recording.md)                       |
| expand a shell card after `/reload` and see no preview       | [Saved-output previews](docs/presentation.md#saved-output-previews) |

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

Maintainers use these checks:

| When you…                             | Read                                                        |
| ------------------------------------- | ----------------------------------------------------------- |
| change tested behaviour               | [Coverage specification](docs/testing.md)                   |
| check clicks, keys, or layout by hand | [Terminal checks](docs/validation.md)                       |
| check an adapter by hand              | [Adapter validation](docs/validation.md#adapter-validation) |
