# Pi compatibility for maintainers

[pi-todo](../README.md)

> Last verified against Pi 1.5.0 with the package checks, offline tests, a `validateToolArguments` probe of the model-facing schema, and a source review of the Pi 1.4.0 to 1.5.0 changes. Not covered: manual terminal checks.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and [interactive checks](validation.md). Include the offline working-message fixture with other contributors, reload, new sessions, and both regular and fullscreen modes.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Model-only execution must keep mutations atomic and results replayable across session changes.

### Tool

Handlers in [activation](../src/runtime.ts) and the [tool](../src/tool.ts) assume TUI mode with a UI, so no other mode may reach them.

- [ ] Only interactive TTY sessions activate the extension.
- [ ] Pi's public `parseArgs` still distinguishes flags from option values for the activation check.
- [ ] Pi accepts the tool's model-facing schema.
- [ ] Tool cards render without custom tool renderers.
- [ ] With `exposure: "model-only"`, direct calls stay replayable.
- [ ] With `exposure: "model-only"`, nested calls through `ctx.tools` or `ctx.executeTool()` can't change todos.
- [ ] Malformed final tool-call JSON fails host validation before execution, changes nothing, and produces a host error result that replay skips.

### Schema projection

[Tool-schema projection](../../../libs/src/tool-schema/README.md):

- [ ] Serialised parameters keep optional and nullable parent IDs and field limits, without exposing runtime metadata or unsupported integer bounds.
- [ ] Out-of-range parent IDs are still domain errors that change nothing.

### Session state and UI

The [browser controls](controls.md#the-todos-browser) describe what users see.

- [ ] [Session state](../src/state/session-state.ts) rebuilds the list from the current branch after branch changes and compaction.
- [ ] Rebuilding skips malformed results and host error results.
- [ ] Rebuilding skips snapshots that exceed the current limits.
- [ ] On `session_start`, [UI integration](../src/index.ts) rebuilds the list, starts the browser host, and attaches the widget.
- [ ] On `session_shutdown`, UI integration closes open views and removes only the todo widget registration.
- [ ] Remapped `tui.select.*` keys still move the `/todos` browser selection.
- [ ] Clearing todo activity leaves other working-message contributions intact.
- [ ] In fullscreen mode, `/todos` is never an overlay, at any size.
- [ ] With [fullscreen input routing](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership), focused browser actions, including remapped cancel and confirm, take priority over transcript controls.
- [ ] If routing is unsupported, a warning that suggests regular mode appears once per opening, and the view stays open.
- [ ] Closing the view restores the widget.
- [ ] Closing a regular-mode overlay hides only that overlay.

## Limitations

- Compare any public APIs for todo state, widgets, or contributions with the current replay and ownership rules.
- Pi 1.5.0 validates the model-facing schema with `@earendil-works/pi-schema` coercion before execution. Numeric strings become numbers, a single ID becomes a one-item `blockedBy` array, and a real `null` in an optional non-nullable field is dropped. A real `null` `parentId` stays `null`, because the schema accepts it, so it still means a root or a detach. The text `"null"` for `parentId` fails validation. Pi validates a copy, so the saved tool call keeps the model's arguments; replay reads only result snapshots.
- In Pi 1.5.0, inline `ctx.ui.custom()` accepts a `blocked` option that reports Pi as waiting for input. The `/todos` browser is a read-only view, not a prompt, so it does not set the option.
- The shared [working-message composition](../../../libs/src/working-message/README.md#behaviour) can't stop extensions that don't use it from overwriting the message. If Pi adds support for this, handle it in libs.
