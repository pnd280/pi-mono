# Pi compatibility for maintainers

[pi-todo](../README.md)

> Last verified against Pi 1.5.2 with the package checks, offline tests, and a source review of the Pi 1.5.1 to 1.5.2 changes. Not covered: the `validateToolArguments` probe of the model-facing schema, which last ran on Pi 1.5.1; manual terminal checks.

## Upgrade procedure

Run the [interactive checks](validation.md).

## Checklist

### Tool

Handlers in [activation](../src/runtime.ts) and the [tool](../src/tool.ts) assume TUI mode with a UI, so no other mode may reach them.

- [ ] Only interactive TTY sessions activate the extension.
- [ ] Pi's public `parseArgs` still distinguishes flags from option values for the activation check.
- [ ] Pi accepts the tool's model-facing schema.
- [ ] Tool cards render without custom tool renderers.
- [ ] Malformed final tool-call JSON fails host validation before execution, changes nothing, and produces a host error result that replay skips.

### Schema projection

[Tool-schema projection](../../../libs/src/tool-schema/README.md):

- [ ] Serialised parameters keep optional and nullable parent IDs and field limits, without exposing runtime metadata or unsupported integer bounds.
- [ ] Out-of-range parent IDs are still domain errors that change nothing.

### Session state and UI

The [browser controls](controls.md#the-todos-browser) describe what users see.

- [ ] Pi's `sessionManager.getBranch()` returns every entry from the root to the current leaf, including entries before compaction.
- [ ] On `session_start`, [UI integration](../src/index.ts) rebuilds the list, starts the browser host, and attaches the widget.
- [ ] On `session_shutdown`, UI integration closes open views and removes only the todo widget registration.
- [ ] If [fullscreen input routing](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership) is unsupported, a warning that suggests regular mode appears once per opening, and the view stays open.
- [ ] Closing a regular-mode overlay hides only that overlay.

## Limitations

- Pi 1.5.2 validates the model-facing schema with `@earendil-works/pi-schema` coercion before execution. Numeric strings become numbers, a single ID becomes a one-item `blockedBy` array, and a real `null` in an optional non-nullable field is dropped. A real `null` `parentId` stays `null`, because the schema accepts it, so it still means a root or a detach. The text `"null"` for `parentId` fails validation. Pi validates a copy, so the saved tool call keeps the model's arguments; replay reads only result snapshots.
- The `/todos` browser is a read-only view, not a prompt, so it does not set the [`blocked` option](../../../libs/docs/pi-compatibility.md#limitations) of `ctx.ui.custom()`.
- The shared [working-message composition](../../../libs/src/working-message/README.md#behaviour) can't stop extensions that don't use it from overwriting the message.
