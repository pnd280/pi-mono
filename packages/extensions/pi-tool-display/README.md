# pi-tool-display

Borderless Pi TUI tool cards with one-line run summaries, exploration groups, live shell previews, and [file diffs](docs/presentation.md#diff-viewer), using the active theme/highlighter.

## Usage

Pi's expansion key (default **Ctrl+O**) cycles **summary** → **compact** → **verbose** → **summary**:

- **Summary** (default): each completed tool-call run becomes [one summary line](docs/presentation.md#summary-mode); pending runs show compact cards. Requires fullscreen mode; in regular mode, summary renders as compact and **Ctrl+O** toggles compact and verbose. Click a line to open its run; click its horizontal rule to collapse it again.
- **Compact**: the cards and groups described below.
- **Verbose**: every card expanded, with Pi's startup header and loaded resources. Pi's `--verbose` starts here.

Adjacent read/search/list calls with matching scopes or filters form [exploration groups](docs/presentation.md#groups); adjacent `todo` calls form **Todos** groups. Single calls use cards.

Compact cards show [result summaries](docs/presentation.md#results) or bounded previews and edit/write diffs. Diagnostics and images remain visible.

In fullscreen mode, group clicks toggle all members; in regular mode, the terminal owns mouse input.

Summary mode hides output from transcript search; images and failure details appear only when the run opens, though their calls count in its line. Switching modes does not preserve scroll position.

Assistant prose uses a `•` marker. Collapsed thinking (default **Ctrl+T**) hides finished thinking blocks; revealing them restores group boundaries.

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

The [pi-nested-instructions message adapter](src/adapters/pi-nested-instructions/README.md) renders live and saved instruction notices as expandable cards and contributes instruction counts to run summaries.

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

Mode changes survive `/reload` and session switches in the current process without writing settings. A new process uses the startup setting (or `--verbose`).

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

No extension-specific environment variables, CLI flags, or settings writes.

## Side effects

### Observation and saved history

In TUI sessions, verified native `bash`, `powershell`, `edit`, and `write` observations collect shell previews, timing, outcomes, and pre-write contents. [File observations](../../libs/src/file-mutations/README.md) are shared with `pi-agent-summary` without duplicate reads. External writers may race; display failures never change tool outcomes.

Session history stores operation/cancellation facts, bounded patches, and saved-output references in `pi-tool-display.facts` custom entries outside model context. Live shell previews stay in memory. **Deleted/context lines from overwritten files may persist in history.**

Display observation excludes SDK overrides, custom tools, and manual `!`/`!!` commands. Other extensions may still observe files in print, JSON, or RPC modes.

History replays facts for matching calls on the selected ancestry without rerunning tools or rereading files. Unrecorded durations, exact exit codes, and pre-write contents remain unavailable; [outcomes](docs/presentation.md#outcomes) cannot be inferred from output text alone.

Expanding completed shell cards reads bounded previews from Pi's temporary output files; see [loading/retry behavior](docs/presentation.md#saved-output-previews). No durable output archive or network requests.

[Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches; large, binary, or unavailable changes never block native operations.

## Compatibility

Verified against Pi 0.87.1 via API and installed CLI. Unsupported host hooks warn and fall back: native observation stops (saved data can still render), assistant presentation remains native, summary mode renders as compact, or **Ctrl+O** toggles only collapsed and verbose modes, according to the unavailable contract. See the [compatibility checklist](docs/pi-compatibility.md).

No tool registration, active-tool changes, or added keybindings; the mode cycle reuses Pi's expansion action. Custom cards do not apply to HTML exports.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-tool-display` and the [validation guide](docs/validation.md) for manual host checks and platform limits.
