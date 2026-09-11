# pi-tool-display

Compact, borderless built-in tool activity for Pi's standard terminal CLI, with expandable output and numbered edit diffs.

## Usage

Use Pi's tool expansion action (**Ctrl+O** by default) to inspect retained output and submitted write content. Expansion cannot recover output discarded by the tool; backend omission notices and saved-output paths remain visible when collapsed.

For custom/MCP tools or SDK hosts, use [renderer integration](docs/renderers.md).

## Configuration

There are no extension-specific settings or environment variables. Appearance follows Pi's theme and expansion state. Pi retains its own already-configured tools and execution settings; the extension does not read settings.

## Side effects and compatibility

In the standard CLI, the default extension decorates only Pi-owned built-ins; tools overridden by other extensions are left unchanged, even when they have built-in names. It never registers tools or changes the active tool list. Stored definitions, schemas, prompt metadata, ownership, execution, and model-visible arguments/results remain unchanged.

Live and historical cards depend on the private `InteractiveMode.prototype.getRegisteredToolDefinition` lookup, verified against Pi **0.85.1**. The extension installs a reversible wrapper before history reconstruction and returns copies with display callbacks. If installation is unavailable, it warns and keeps original rendering. If decoration fails, it returns the available original view; failures in the previous lookup propagate without retry. Shutdown and non-TUI startup deactivate the hook without removing later wrappers.

The automatic integration is CLI-only: Pi also labels SDK base-tool overrides as `builtin`, so that label alone cannot establish native ownership. SDK hosts must use the explicit [renderer factory](docs/renderers.md) instead.

The extension makes no network requests, reads no tool files, and writes no settings or session entries.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-tool-display`. For display, lifecycle, or Pi compatibility changes, also follow the [manual validation procedure](docs/validation.md).
