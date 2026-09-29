# pi-todo development

## Code navigation

- **Lifecycle and tool:** [src/index.ts](src/index.ts), [src/runtime.ts](src/runtime.ts), and [src/tool.ts](src/tool.ts).
- **State and replay:** [src/controller.ts](src/controller.ts), [src/reducer.ts](src/reducer.ts), [src/hierarchy.ts](src/hierarchy.ts), and [src/session-state.ts](src/session-state.ts).
- **UI and fixtures:** [src/commands.ts](src/commands.ts), [src/todos-view.ts](src/todos-view.ts), and [validation/](validation/).

## Constraints

Keep hierarchy independent of status and dependencies, mutations atomic, and every result fully replayable.

Leave cards to the host; attach no renderer fields to the tool definition.

Reuse shared terminal sanitization and [custom-UI mounting](../../libs/src/tui/responsive-custom-ui/README.md). Publish activity through the [working-message coordinator](../../libs/src/working-message/README.md), not directly to Pi. Keep UI ownership local; use non-overlay UI in fullscreen mode without global keybinding changes.

See [package behavior](README.md) and [workspace reuse guidance](../../../docs/agents/architecture.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Follow [workspace verification](../../../docs/agents/verification.md) for `pi-todo`. For UI changes, use the [interactive checks](docs/validation.md); see [coverage boundaries](docs/testing.md#coverage-boundaries) before duplicating shared-library tests.
