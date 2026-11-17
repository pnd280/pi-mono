# pi-tool-display

Long agent runs bury tool results. pi-tool-display replaces Pi's default tool-call output with compact cards, and lets you choose the starting display mode, whether cards show optional parameters, and which renderer each tool uses. Finished runs collapse to one line, above the files that they changed, unless you have opened them:

```text
▸ Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file   14 calls
  ├ M src/run-summary.ts             +18 -4
  ├ M src/rendering/summary-line.ts  +44 -11  3 edits
  └ A docs/changed-files.md          +64
```

Click the line to see the cards again. Cards use the active theme and syntax highlighter, show live shell previews, and show [file diffs](docs/presentation.md#diff-viewer) for edits and writes.

## Controls

The extension registers no commands, CLI flags, model tools, or keybindings, and it leaves the active tools unchanged. It reuses these Pi controls:

| Control                                                                | Effect                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pi's expansion key (default **Ctrl+O**)                                | Cycle the display modes: `summary`, `compact`, `verbose`, then back to `summary`.                             |
| Pi's thinking toggle (default **Ctrl+T**)                              | When thinking is collapsed, hide finished thinking blocks; see [thinking](docs/presentation.md#thinking).     |
| `pi --verbose`                                                         | Start in `verbose` mode instead of the `collapsedMode` setting.                                               |
| Click a card, group, or summary line (fullscreen)                      | Expand it. Click an opened run's summary line, or the `▴ collapse` bar below its cards, to collapse it again. |
| Click a subagent card or background result with a task ID (fullscreen) | Open the task's transcript in fullscreen. Use **Ctrl+O** to expand its details.                               |
| Click a job card or job result (fullscreen)                            | Open the job.                                                                                                 |

## Usage

The display mode decides how much of each call you see:

| Mode                | What you see                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary` (default) | Finished runs collapse to [one summary line](docs/presentation.md#summary-mode) unless you have opened them. Runs with only todo calls and no instruction notices disappear. Runs still in progress show compact cards. |
| `compact`           | One card per call, with bounded [result previews](docs/presentation.md#results). Related calls share an exploration group.                                                                                              |
| `verbose`           | Every card expanded, plus Pi's startup header and loaded resources.                                                                                                                                                     |

A _run_ contains this extension's consecutive calls between visible non-thinking boundaries, such as assistant prose, an unrelated notice, or a tool with its original renderer.

An _exploration group_ combines adjacent calls with the same directory or literal-filter scope under one heading, such as "Explored src/".

Compact cards keep diagnostics and images beneath their call when successful text is hidden. A closed summary hides those cards, including their diagnostics and images; open the run to inspect them.

Assistant prose starts with a `•` marker.

### Mouse and terminal modes

Summary lines need Pi's fullscreen mode. In regular mode, `summary` renders as `compact`, and **Ctrl+O** toggles between `compact` and `verbose`.

Clicks work only in fullscreen; regular mode leaves mouse input to the terminal. Cards ignore clicks with **Shift**, **Alt**, or **Ctrl** held, so those clicks don't expand, collapse, or open anything. Before pi-subagents opens a task or job, it checks that the card is current and that it owns the task or job.

### Supported tools

These tools get dedicated cards:

- Pi's native tools: read, bash, PowerShell, edit, write, and the search and listing tools.
- Pi's built-in codemode, MCP, and tool search.
- Extensions: the MCP adapter, todo, selective read, smart compact, pi-profiles' tool search, and subagents, including background jobs.
- Nested-instruction notices, which also count towards run summaries.
- Subagent background results and job results.

A dedicated card replaces any renderer the tool supplies. Other tools keep their own renderer if they have one, including renderers that extensions supply through `registerToolRenderer`; otherwise they get a generic card. Calls to tools that are not loaded, such as old calls or MCP calls before the server reconnects, get a generic card. If the tool registers later, cards from earlier in the session history switch to its dedicated card; cards of calls made while it was missing stay generic.

### Pi version fallbacks

Automatic integration and native observation depend on private Pi contracts. When one of them is unavailable, the extension turns off the affected feature:

| Missing contract       | Fallback                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI host hooks         | Pi shows a warning, and tool calls and assistant text keep Pi's own rendering. Message cards stay registered.                                                                                                                                                         |
| Native observation     | Observation stops; operation and change facts replay only with the native adapter.                                                                                                                                                                                    |
| Assistant presentation | Pi shows a warning. Assistant text renders natively without prose markers, collapsed thinking placeholders stay visible, and thinking ends runs.                                                                                                                      |
| Summary rows           | Pi shows a warning that summaries, card actions, and click modifiers are disabled. `summary` renders as `compact`, clicks on subagent and job cards expand them instead of opening the task or job, and clicks with **Shift**, **Alt**, or **Ctrl** held also expand. |
| Mode cycle             | **Ctrl+O** toggles only between collapsed and `verbose`.                                                                                                                                                                                                              |

### Display limits

- Transcript search cannot find output hidden inside a summary line, including image and failure details, until you open the run.
- Switching modes does not keep the scroll position.
- Custom cards do not appear in HTML exports.

## Configuration

Put the `ext.pi-tool-display` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), in `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), or in both. Trusted project settings merge over global settings key by key, and Pi ignores untrusted project settings. Run `/reload` after you edit settings.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-tool-display": {
    // Optional. The starting mode, also used when a Pi action collapses verbose output. "summary" or "compact". Default: "summary". Ctrl+O follows the mode cycle.
    "collapsedMode": "summary",
    // Optional. true shows optional details on dedicated cards. Default: false. Structured blocks still need expansion. MCP and generic cards always show arguments.
    "showParameters": false,
    // Optional. The renderer for each exact, registered tool name. Default: "auto" for every tool.
    "rendererOverrides": {
      // "auto" uses automatic selection. In a project file, it also resets an override from global settings.
      "read": "auto",
      // "generic" shows the tool's data on a generic card and turns off this extension's observation of it.
      "search_docs": "generic",
      // "original" leaves the tool's rendering, grouping, and observation to Pi. Other extensions may still observe it.
      "bash": "original"
    }
  }
}
```

`rendererOverrides` must use the registered tool names. Pi's built-in MCP extension changes MCP tool names when it registers them; see [MCP tools](docs/tools.md#mcp-tools).

Any invalid section in a file that applies, even one that a later file overrides, restores original tool rendering and stops native observation. Message cards for nested instructions, subagent background results, and job results remain registered. The terminal warning names the file and key.

Mode changes from **Ctrl+O** survive `/reload` and session switches within the process, without writing settings. New processes start from `collapsedMode` (or `--verbose`). Settings leave tool execution and saved arguments unchanged. The extension has no environment variables.

## Side effects

- The extension observes live tool calls and replays recorded facts. Neither changes tool execution, and the extension makes no network requests.
- In TUI, RPC, print, and JSON sessions, session history keeps facts that Pi's own entries lack in `pi-tool-display.call` entries outside the model's context: cancellation for every call that the extension displays, and, for verified Pi-native `bash`, `powershell`, `edit`, and `write` calls, observed facts such as a failed shell's exit code and bounded patches.
- Patches can keep deleted text. Removed and context lines from overwritten files may remain in session history.
- The extension writes no files of its own and never writes settings. Live shell previews stay in memory only.
- Reopening a session restores the recorded facts without rerunning tools or reading source files again.
- Expanding a finished shell card reads a bounded preview of Pi's temporary output file. [Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches. Large, binary, or unavailable changes never block a native operation.
- Warnings appear as Pi notifications in TUI and RPC sessions. Print and JSON sessions write them to stderr. Warnings at the shutdown of a TUI quit go to stderr when Pi exits, because the terminal display has already stopped. A warning raised while a quit cancels a running agent is not shown.

## Docs

| When you…                                                                     | Read                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Want to know how the calls of each tool appear and what each card needs       | [Supported tool cards](docs/tools.md)                               |
| Want the card layout, groups, summary lines, diffs, or display limits         | [Tool card presentation](docs/presentation.md)                      |
| Want the exact facts saved, the exclusions, and the replay rules              | [Recorded data and replay](docs/recording.md)                       |
| Expand a shell card after `/reload` and see no preview                        | [Saved-output previews](docs/presentation.md#saved-output-previews) |
| Want to give your own tool a custom card                                      | [Standalone renderer API](docs/renderers.md)                        |
| Want automatic integration for a tool, which needs a resolver in this package | [Add an adapter](docs/adapters.md#add-an-adapter)                   |
| Change tested behaviour                                                       | [Coverage specification](docs/testing.md)                           |
| Check clicks, keys, or layout by hand                                         | [Terminal checks](docs/validation.md)                               |
| Check an adapter by hand                                                      | [Adapter validation](docs/validation.md#adapter-validation)         |
| Upgrade Pi, or check the verified version and coverage limits                 | [Pi compatibility](docs/pi-compatibility.md)                        |
