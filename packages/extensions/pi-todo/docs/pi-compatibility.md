# Pi compatibility for maintainers

[pi-todo](../README.md)

> Last verified against Pi 1.3.0 (package checks and offline tests). Not covered: manual terminal checks.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and [interactive checks](validation.md). Include the offline working-message fixture with other contributors, reload, new sessions, and both regular and fullscreen modes.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Model-only execution must keep mutations atomic and results replayable across session changes.

### Tool

[Activation](../src/runtime.ts) and [tool](../src/tool.ts):

- [ ] Only interactive TTY sessions activate the extension, using Pi's public `parseArgs` to distinguish flags from option values. Handlers assume TUI mode with a UI, so no other mode may reach them.
- [ ] The model-facing schema, atomic mutations, and fully replayable result details still work, with no custom tool renderers.
- [ ] `exposure: "model-only"` keeps direct calls replayable, and prevents nested changes through `ctx.tools` or `ctx.executeTool()`.
- [ ] Malformed final tool-call JSON fails host validation before execution, changes nothing, and produces a host error result that replay skips.

### Schema projection

[Tool-schema projection](../../../libs/src/tool-schema/README.md):

- [ ] Serialised parameters keep optional and nullable parent IDs and field limits, without exposing runtime metadata or unsupported integer bounds.
- [ ] Out-of-range parent IDs are still domain errors that change nothing.

### Session state and UI

- [ ] [Session state](../src/state/session-state.ts): rebuilding after branch changes and compaction, handling of malformed and error results, and bounded snapshots.
- [ ] [UI integration](../src/index.ts): widget and browser lifecycle, remapped navigation, session cleanup, and working-message contributions owned independently.
- [ ] [Fullscreen input routing](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership): `/todos` is never an overlay, at any size. Focused browser actions, including remapped cancel and confirm, take priority over transcript controls as described in the [browser controls](../README.md#the-todos-browser).
- [ ] If routing is unsupported, a warning appears once per opening and the view stays open. The warning suggests regular mode if controls do not respond. Closing the view restores the widget.
- [ ] Closing a regular-mode overlay hides only that overlay.

## Limitations

- Compare any public APIs for todo state, widgets, or contributions with the current replay and ownership rules.
- The shared [working-message composition](../../../libs/src/working-message/README.md#behaviour) can't stop extensions that don't use it from overwriting the message. If Pi adds support for this, handle it in libs.
