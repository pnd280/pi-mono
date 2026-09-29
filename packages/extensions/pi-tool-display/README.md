# pi-tool-display

Borderless Pi TUI tool cards with one-line run summaries, exploration groups, live shell previews, and [file diffs](docs/presentation.md#diff-viewer), using the active theme/highlighter.

## Usage

Pi's expansion key (default **Ctrl+O**) cycles tool output through **summary** → **compact** → **verbose** → **summary**. The status line names the mode (`Tool output: summary`):

- **Summary** (default): each tool-call run becomes [one summary line](docs/presentation.md#summary-mode), such as `Read 4 files · edited 2 files · ran 3 commands (1 failed)`. Until a run ends, it shows compact cards. Summaries require Pi's fullscreen mode; in regular mode, summary renders as compact and **Ctrl+O** toggles compact and verbose. Click a summary line to open its run as compact cards until the next mode change; clicking a card before the run ends also keeps it open. Opened runs have a blank row inside each plain horizontal rule. Click either rule or its inner padding to restore the line.
- **Compact**: the cards and groups described below.
- **Verbose**: every card expanded, with Pi's startup header and loaded resources. Pi's `--verbose` starts here.

Adjacent read/search/list calls with matching directory scopes or literal filters form [exploration groups](docs/presentation.md#groups); adjacent `todo` calls form **Todos** groups. Single calls use cards. Source order is preserved, with notices, images, and diagnostics beneath each call.

Compact cards show [result summaries](docs/presentation.md#results) or bounded previews, shell status beside output, collapsed successful-read text, and edit/write diffs. Diagnostics and images stay visible.

In fullscreen mode, group clicks toggle all members; in regular mode, the terminal owns mouse input.

Summary mode hides output from transcript search; images and failure details appear only when the run opens, though their calls count in its line. Switching modes does not preserve scroll position.

Assistant prose blocks use `•` with a hanging indent, matching tool headings. Markdown formatting stays native; user messages, thinking, and diagnostics do not gain markers.

Collapsed thinking (default **Ctrl+T**) hides placeholders as their thinking blocks finish, without waiting for the assistant message to end, allowing matching calls to group across them. Revealing thinking restores group boundaries, but thinking never splits or settles a tool run. Live indicators and assistant text stay visible.

MCP/generic cards always show arguments, bounded when collapsed. Other specialized cards hide parameter blocks by default even when expanded, but retain command/path/search summaries.

### Tool coverage

Specialized cards override even supplied custom renderers for:

- [Verified native tools](src/adapters/native/README.md)
- [`@ff-labs/pi-fff`](src/adapters/@ff-labs/pi-fff/README.md)
- [`pi-mcp-adapter`](src/adapters/pi-mcp-adapter/README.md)
- [`pi-todo`](src/adapters/pi-todo/README.md)
- [`pi-selective-read`](src/adapters/pi-selective-read/README.md)
- [`pi-smart-compact`](src/adapters/pi-smart-compact/README.md): compaction request/focus/model cards and readable context-window usage.

Other tools retain custom `renderCall`/`renderResult`; tools with neither, or historical calls without current definitions, use generic cards from retained data.

The dedicated [pi-nested-instructions message adapter](src/adapters/pi-nested-instructions/README.md) renders loaded, updated, and removed instruction notices as compact status/path cards with expandable Markdown. It also renders saved notices when discovery is not loaded. Notices join the preceding tool run when present: they hide with its summary and return in place when it opens. They separate exploration groups and contribute [instruction counts](src/adapters/pi-nested-instructions/README.md#display), such as `loaded 2 instruction files`, to the summary.

Use the [renderer API](docs/renderers.md) for tool-author/SDK integration and [adapter development](docs/adapters.md) for automatic selection.

## Configuration

Set literal `ext.pi-tool-display` in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Trusted projects may override it in `.pi/settings.json`:

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

`collapsedMode` selects the startup mode (`summary` by default or `compact`) and the target when an extension calls `setToolsExpanded(false)` from verbose. **Ctrl+O** follows the [mode cycle](#usage) regardless of this setting. A collapse request in summary or compact leaves the mode unchanged.

The current Pi host retains mode changes across transcript reconstruction, `/reload`, and session switches without writing settings or history. A new process uses the startup setting (or `--verbose`).

`showParameters` defaults to `false`; `true` shows optional details, with structured blocks still requiring expansion. MCP/generic cards always show arguments. Custom renderers, execution, and saved arguments are unaffected.

`rendererOverrides` maps exact tool names to:

| Value      | Behavior                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| `auto`     | Default [selection](#tool-coverage).                                                       |
| `generic`  | Supplied arguments/results without specialized rendering or this extension's observations. |
| `original` | Bypass this extension's rendering, grouping, and future observation.                       |

Unavailable names are allowed. Overrides neither enable tools, delete metadata, nor disable other extensions' observations.

Settings load before history reconstruction and on `/reload`. Trusted project fields merge over global settings: explicit `collapsedMode` and `showParameters` replace, omission inherits; overrides replace by tool name, `auto` resets inherited overrides, and an empty map inherits.

Untrusted project settings are ignored before validation. Applicable sections validate before merging; either invalid section preserves original renderers and disables display observations, even if later overridden. Warnings name the source/key as terminal-safe text without changing settings or paths.

No extension-specific environment variables, CLI flags, watchers, or settings writes.

## Side effects

### Observation and saved history

In TUI sessions, verified native `bash`, `powershell`, `edit`, and `write` observations collect shell previews, timing, outcomes, and pre-write contents. [File observations](../../libs/src/file-mutations/README.md) are shared with `pi-agent-summary` without duplicate reads. External writers may race; display failures never change tool outcomes.

Session history stores operation/cancellation facts, bounded patches, and saved-output references in `pi-tool-display.facts` custom entries outside model context. Live shell previews stay in memory. **Deleted/context lines from overwritten files may persist in history.** Native edit patches are saved before result middleware can replace them.

Display observation excludes SDK overrides, custom tools, and manual `!`/`!!` commands. Other extensions may still observe files in print, JSON, or RPC modes.

Recorded cancellations survive middleware, replay, and renderer changes in generic/specialized cards. [Detection](docs/presentation.md#outcomes) needs recorded or structured evidence, never output text alone, including older/print histories.

History replays facts only for matching calls on the selected ancestry, without rerunning tools or animating incomplete calls. Unrecorded durations, exact exit codes, and pre-write contents remain unavailable.

Expanding completed shell cards reads bounded previews from Pi's temporary output files. Failed calls retain published results beside previews; unavailable files retain output with a notice. See [loading/retry behavior](docs/presentation.md#saved-output-previews). No durable output archive or network requests.

[Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches; large, binary, or unavailable changes never block native operations.

## Compatibility

Native observation is verified against Pi 0.87.1 via API and installed CLI. Unverified required hooks disable observation with a warning; saved data can still render.

Prose markers and hiding completed thinking require Pi 0.87.1's verified assistant component; unavailable/already-wrapped contracts retain Pi's original presentation.

Joined row spacing and summaries require Pi 0.87.1's verified tool-row contract. Otherwise the host warns once, keeps Pi's spacing, and renders summary mode as compact.

Mode cycling requires Pi 0.87.1's verified expansion methods. Otherwise a warning reports that Ctrl+O toggles only the collapsed mode and verbose.

No tool registration, active-tool changes, or added keybindings; the mode cycle reuses Pi's expansion action. Custom cards do not apply to HTML exports.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-tool-display` and the [validation guide](docs/validation.md) for manual host checks and platform limits.
