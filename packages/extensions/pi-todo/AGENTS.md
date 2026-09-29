# pi-todo development

## Code navigation

- `src/index.ts` and `src/runtime.ts`: Pi registration and TUI activation.
- `src/reducer.ts`, `src/hierarchy.ts`, and `src/controller.ts` manage todo transitions and state isolation.
- `src/session-state.ts`, `src/limits.ts`, and `src/mutation-schema.ts` validate stored state and mutations.
- `src/tool.ts` adapts model input and returns replayable results. `src/tool-schema.ts` defines the model-facing schema.
- `src/commands.ts`, `src/todos-view.ts`, `src/todo-overlay.ts`, and `src/task-presentation.ts`: commands and UI.
- `validation/` provides the offline working-message launcher and fixture contributors.

## Constraints

Keep hierarchy independent of status and dependencies, mutations atomic, and every result fully replayable.

Leave cards to the host; attach no renderer fields to the tool definition.

Reuse shared terminal sanitization and [custom-UI mounting](../../libs/src/tui/responsive-custom-ui/README.md). Publish activity through the [working-message coordinator](../../libs/src/working-message/README.md), not directly to Pi. Keep UI ownership local; use non-overlay UI in fullscreen mode without global keybinding changes.

See the [package behavior](README.md) and [workspace reuse guidance](../../../docs/agents/architecture.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Follow the [workspace verification workflow](../../../docs/agents/verification.md) for `pi-todo`. Tests are colocated with their owning modules. For UI changes, use the [interactive checks](docs/validation.md).
