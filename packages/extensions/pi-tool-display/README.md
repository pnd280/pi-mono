# pi-tool-display

Compact, borderless built-in tool activity for Pi's standard terminal CLI, with expandable output and numbered edit diffs.

## Usage

Use Pi's tool expansion action (**Ctrl+O** by default) to inspect retained output and submitted write content. Expansion cannot recover output discarded by the tool; backend omission notices and saved-output paths remain visible when collapsed.

For custom/MCP tools or SDK hosts, use [renderer integration](docs/renderers.md).

## Configuration

There are no extension-specific settings or environment variables. Appearance follows Pi's theme and expansion state. The extension reads Pi's `shellPath`, `shellCommandPrefix`, and `images.autoResize` settings, honoring project trust. Settings read errors skip registration and produce a warning.

## Side effects and compatibility

The default extension decorates only Pi-owned built-ins; tools overridden by other extensions are left unchanged. Model-visible arguments/results, tool execution, and the active tool list stay unchanged.

Transcript replay during `/reload` depends on a private Pi API; if it is unavailable, Pi warns that restored rows may use default displays.

Settings reads may acquire temporary locks. The extension makes no network requests and writes no settings or session entries.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-tool-display`. For display, lifecycle, or Pi compatibility changes, also follow the [manual validation procedure](docs/validation.md).
