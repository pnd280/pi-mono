# pi-tool-display

Borderless tool cards for Pi's interactive terminal UI, with exploration groups, live shell previews, and [file diffs](docs/presentation.md#diff-viewer). Colors and syntax highlighting use Pi's active theme.

## Usage

Adjacent read, search, and list calls form [exploration groups](docs/presentation.md#card-layout) under an **Exploring** or **Explored** heading. Calls stay in source order, with notices, images, and failure diagnostics directly beneath their call.

Pi's tool expansion action, **Ctrl+O** by default, reveals individual cards and available output. In fullscreen mode, a group click expands or collapses all its members. In regular mode, the terminal handles mouse input.

Specialized cards hide parameter blocks by default, even when expanded. Command, path, and search summaries remain visible. Generic cards always show their arguments, with bounded previews while collapsed.

### Tool coverage

[Verified native tools](src/adapters/native/README.md), [`@ff-labs/pi-fff` tools](src/adapters/@ff-labs/pi-fff/README.md), and [`pi-mcp-adapter` tools](src/adapters/pi-mcp-adapter/README.md) receive specialized cards, even when they supply custom renderers.

For other tools, the extension preserves custom `renderCall` or `renderResult` fields and uses generic cards when neither is supplied. Historical calls without a current tool definition use generic cards built from saved data.

For tool-author or SDK integration, use the [renderer API](docs/renderers.md). To add automatic tool selection, follow [adapter development](docs/adapters.md).

## Configuration

Set the literal top-level key `ext.pi-tool-display` in Pi's global `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` if that environment variable is set. Trusted projects can override it in `.pi/settings.json`:

<!-- prettier-ignore -->
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

`showParameters` is a boolean and defaults to `false`. Set it to `true` to show parameter details for specialized cards. Structured parameter blocks still require expansion. This setting does not change generic cards, custom renderers, tool execution, or saved arguments.

`rendererOverrides` maps exact tool names to these string values:

| Value      | Behavior                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `auto`     | The default. Uses the selection described in [Tool coverage](#tool-coverage).                      |
| `generic`  | Uses supplied arguments and results without specialized rendering or native operation observation. |
| `original` | Bypasses this extension's rendering, grouping, and future observation.                             |

Overrides accept unavailable tool names. They do not enable tools or delete saved metadata.

Settings load before history reconstruction and on `/reload`. Trusted project settings merge with global settings:

- An explicit `showParameters` value replaces the global value. Omission inherits it.
- Renderer overrides replace global entries by tool name. Project `auto` resets an inherited override. An empty map inherits global entries.

The extension ignores untrusted project settings. It validates global and trusted project settings before merging them. An invalid section preserves the original renderers and disables this extension's observation, even if a later source overrides the invalid value. The warning names the source and key.

There are no extension-specific environment variables, CLI flags, file watchers, or settings writes.

## Side effects

### Observation and saved history

In interactive TUI sessions, the extension observes verified native `bash`, `powershell`, `edit`, and `write` operations. It collects shell previews, operation timing, outcomes, and file contents before writes. External writers can race with those reads. Display failures do not change tool outcomes.

The extension saves operation facts, cancellation facts, bounded patches, and saved-output references in session history, outside model context. Live shell previews stay in memory. **Deleted lines and context lines from overwritten files can remain in session history.** Native edit patches are saved before result middleware can replace them.

Native operation observation excludes SDK tools, custom implementations, and user `!` and `!!` commands. It does not run in print, JSON, or RPC mode.

The extension records cancellation when an unsuccessful execution result arrives after the live run is aborted. This applies to generic cards as well as specialized cards. Successful results and failures received before the abort retain their outcomes. Recorded cancellations survive result middleware, replay, and renderer changes.

History needs recorded or structured evidence to show cancellation. Output text alone is insufficient, including in older or print-created histories.

The TUI reconstructs history from saved calls and results without rerunning tools or animating incomplete history. Durations, exact exit codes, and file contents before writes remain unavailable unless recorded.

Expanding a completed shell card loads a bounded preview from Pi's existing temporary output file. Failed calls retain their published result beside the preview; unavailable files leave retained output visible with a notice. See [saved-output previews](docs/presentation.md#saved-output-previews) for loading and retry behavior. The extension creates no durable output archive and makes no network requests.

Live output, saved previews, and patches have [resource limits](docs/presentation.md#resource-limits). Large, binary, or unavailable changes do not block native operations.

## Compatibility

Native observation is verified against Pi 0.85.1. If required host hooks are unavailable or already wrapped, the extension disables observation and warns. It can still render saved data where available.

The extension does not register tools, change active tool selection, or add keybindings. Custom card rendering does not apply to HTML exports.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-tool-display`. The [validation guide](docs/validation.md) lists manual host checks and known platform limitations.
