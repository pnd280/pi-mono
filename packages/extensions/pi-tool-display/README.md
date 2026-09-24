# pi-tool-display

Borderless Pi TUI tool cards with exploration groups, live shell previews, and [file diffs](docs/presentation.md#diff-viewer), using the active theme/highlighter.

## Usage

Adjacent read/search/list calls with matching directory scopes or literal filters form [exploration groups](docs/presentation.md#groups); adjacent `todo` calls form **Todos** groups. Single calls use cards. Source order is preserved, with notices, images, and diagnostics beneath each call.

Compact cards show [result summaries](docs/presentation.md#results) or bounded previews, shell status beside output, collapsed successful-read text, and edit/write diffs. Diagnostics and images stay visible.

Pi expansion (default **Ctrl+O**) reveals individual cards and available output. Fullscreen group clicks toggle all members; regular-mode mouse input belongs to the terminal.

Collapsed thinking (default **Ctrl+T**) hides completed placeholders, allowing matching calls to group across them. Revealing thinking restores boundaries; live indicators and assistant text stay visible.

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

Use the [renderer API](docs/renderers.md) for tool-author/SDK integration and [adapter development](docs/adapters.md) for automatic selection.

## Configuration

Set literal `ext.pi-tool-display` in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Trusted projects may override it in `.pi/settings.json`:

```json
{
  "ext.pi-tool-display": {
    "showParameters": false,
    "rendererOverrides": {
      "search_docs": "generic",
      "bash": "original"
    }
  }
}
```

`showParameters` defaults to `false`; `true` shows optional details, with structured blocks still requiring expansion. MCP/generic cards always show arguments. Custom renderers, execution, and saved arguments are unaffected.

`rendererOverrides` maps exact tool names to:

| Value      | Behavior                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| `auto`     | Default [selection](#tool-coverage).                                                       |
| `generic`  | Supplied arguments/results without specialized rendering or this extension's observations. |
| `original` | Bypass this extension's rendering, grouping, and future observation.                       |

Unavailable names are allowed. Overrides neither enable tools, delete metadata, nor disable other extensions' observations.

Settings load before history reconstruction and on `/reload`. Trusted project fields merge over global settings: explicit `showParameters` replaces, omission inherits; overrides replace by tool name, `auto` resets inherited overrides, and an empty map inherits.

Untrusted settings are ignored. Both sections validate before merging; either invalid section preserves original renderers and disables display observations, even if later overridden. Warnings name the source/key.

No extension-specific environment variables, CLI flags, watchers, or settings writes.

## Side effects

### Observation and saved history

In TUI sessions, verified native `bash`, `powershell`, `edit`, and `write` observations collect shell previews, timing, outcomes, and pre-write contents. [File observations](../../libs/src/file-mutations/README.md) are shared with `pi-agent-summary` without duplicate reads. External writers may race; display failures never change tool outcomes.

Session history stores operation/cancellation facts, bounded patches, and saved-output references outside model context. Live shell previews stay in memory. **Deleted/context lines from overwritten files may persist in history.** Native edit patches are saved before result middleware can replace them.

Display observation excludes SDK overrides, custom tools, and manual `!`/`!!` commands. Other extensions may still observe files in print, JSON, or RPC modes.

Recorded cancellations survive middleware, replay, and renderer changes in generic/specialized cards. [Detection](docs/presentation.md#outcomes) needs recorded or structured evidence, never output text alone, including older/print histories.

History reconstructs without rerunning tools or animating incomplete calls. Unrecorded durations, exact exit codes, and pre-write contents remain unavailable.

Expanding completed shell cards reads bounded previews from Pi's temporary output files. Failed calls retain published results beside previews; unavailable files retain output with a notice. See [loading/retry behavior](docs/presentation.md#saved-output-previews). No durable output archive or network requests.

[Resource limits](docs/presentation.md#resource-limits) bound output, previews, and patches; large, binary, or unavailable changes never block native operations.

## Compatibility

Native observation is verified against Pi 0.87.1 via API and installed CLI. Unverified required hooks disable observation with a warning; saved data can still render.

Hiding completed thinking requires Pi 0.87.1's verified assistant component; unavailable/already-wrapped contracts retain Pi's original presentation.

No tool registration, active-tool changes, or added keybindings. Custom cards do not apply to HTML exports.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-tool-display` and the [validation guide](docs/validation.md) for manual host checks and platform limits.
