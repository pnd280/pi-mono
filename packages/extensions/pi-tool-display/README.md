# pi-tool-display

`pi-tool-display` renders borderless tool cards in Pi's interactive terminal UI. It groups adjacent exploration calls and adds live shell previews and file diffs. Colors and syntax highlighting use Pi's active theme.

## Usage

Adjacent read, search, and list calls share an **Exploring** or **Explored** heading in source order. Notices, images, and failure diagnostics appear directly beneath their call.

Pi's tool expansion action, **Ctrl+O** by default, reveals individual cards and available output. In fullscreen mode, a group click expands or collapses all its members. In regular mode, the terminal handles mouse input.

Specialized cards hide parameter blocks by default, even when expanded. Command, path, and search summaries remain visible. Generic cards always show their arguments. The [card layout reference](docs/renderers.md#card-layout) covers headings, file paths, FFF search summaries, and diagnostics.

Compact [file diffs](docs/renderers.md#diff-viewer) show changed code with nearby context.

## Tool coverage

Verified native tools, [official `@ff-labs/pi-fff` 0.10.6 search tools](docs/adapters.md#fff), and [`pi-mcp-adapter` 2.33.0 tools](docs/adapters.md#pi-mcp-adapter) receive specialized cards. Other tools receive generic cards unless their owner supplies `renderCall` or `renderResult`. In that case, the owner's UI remains unchanged. Historical calls without a current tool definition use generic cards built from saved data.

The [renderer API](docs/renderers.md) supports standalone integration by tool owners and SDK hosts. The [adapter development guide](docs/adapters.md) covers additional tool integrations.

## Configuration

The literal top-level key `ext.pi-tool-display` belongs in Pi's configured global settings or a trusted project's `.pi/settings.json`. For example:

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

`showParameters` is a boolean that defaults to `false`. A value of `true` enables parameter details for specialized cards. Structured parameter blocks still require expansion. This setting does not change generic cards, owner-provided renderers, tool execution, or saved arguments.

`rendererOverrides` maps exact tool names to these string values:

| Value      | Behavior                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `auto`     | The default. Uses the selection described in [Tool coverage](#tool-coverage).     |
| `generic`  | Uses supplied arguments and results without specialized rendering or observation. |
| `original` | Bypasses this extension's rendering, grouping, and future observation.            |

Overrides accept unavailable tool names. They do not enable tools or delete saved metadata.

Settings load before history reconstruction and on `/reload`. Trusted project settings merge with global settings as follows:

- An explicit `showParameters` value replaces the global value. Omission inherits it.
- Renderer overrides replace global entries by tool name. Project `auto` resets an inherited override. An empty map inherits global entries.

Untrusted project settings are ignored. An invalid applicable section disables the extension's rendering and observation, even if a later source overrides the invalid value. The warning names the source and key.

There are no extension-specific environment variables, CLI flags, file watchers, or settings writes.

## Observation and saved history

In interactive TUI sessions, the extension observes verified native `bash`, `powershell`, `edit`, and `write` operations. It collects shell previews, operation timing, outcomes, and file contents before writes. External writers can race with those reads. Display failures do not change tool outcomes.

The extension saves versioned `pi-tool-display.facts` custom session entries outside model context. **Deleted lines and context lines from overwritten files can remain in session history.** Native edit patches are saved before result middleware can replace them.

Automatic observation excludes SDK tools, custom implementations, and user `!` and `!!` commands. Print, JSON, and RPC execution adds no automatic display observations. The TUI reconstructs those sessions from saved calls and results without rerunning tools or animating incomplete history. Unrecorded durations, exact exit codes, file contents before writes, and lost MCP types remain unavailable.

Expanded shell cards load bounded previews from Pi's existing temporary output files asynchronously. Collapsed cards do not start reads. Failed calls retain Pi's published result beside the preview. Missing, unreadable, changing, or non-regular files leave the retained output visible with a limitation notice. If all read slots are occupied, another collapse and expansion retries the read. The extension creates no durable output archive and makes no network requests.

Live output, saved previews, and patches have [resource limits](docs/renderers.md#resource-limits). Large, binary, or unavailable changes do not block native operations.

## Compatibility and validation

Native observation is verified against Pi 0.85.1. Unavailable or previously wrapped host hooks disable observation with a warning; rendering from saved data can continue where available.

The extension does not register tools, change active tool selection, or add keybindings. Custom card rendering does not apply to HTML exports.

The [focused validation commands](../../../docs/development.md#focused-validation) apply to the manifest name `pi-tool-display`. The [validation guide](docs/validation.md) lists manual host checks and known platform limitations.
