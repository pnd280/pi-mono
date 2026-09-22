# pi-todo development

## Code navigation

- `src/index.ts` registers Pi handlers and `pi-todo.activity` with the [working-message coordinator](../../libs/src/working-message/README.md). `src/runtime.ts` controls activation.
- `src/reducer.ts`, `src/hierarchy.ts`, and `src/controller.ts` manage todo transitions and state isolation.
- `src/session-state.ts`, `src/limits.ts`, and `src/mutation-schema.ts` validate stored state and mutations.
- `src/tool.ts` adapts model input and returns replayable results. `src/tool-schema.ts` defines the model-facing schema.
- `src/commands.ts`, `src/todos-view.ts`, and `src/todo-overlay.ts` manage todo navigation, the widget, and activity text.
- `src/task-presentation.ts` shares todo styling between the browser and widget.
- `validation/` provides the offline working-message launcher and fixture contributors.

## Constraints

Keep hierarchy independent of status and dependencies, mutations atomic, and every result fully replayable.

Leave cards to the host; attach no renderer fields to the tool definition.

Reuse shared terminal sanitization, text layout, and custom-UI mounting. Publish activity through the working-message coordinator, never directly to Pi's message. Keep todo selection, widget status, and suppression ownership local. Use non-overlay custom UI in fullscreen mode; retain responsive mounting in regular mode without global keybinding changes.

See the [package behavior](README.md) and [workspace reuse guidance](../../../docs/agents/architecture.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Follow the [workspace verification workflow](../../../docs/agents/verification.md) using package name `pi-todo`. Tests are colocated with their owning modules. See [interactive checks](README.md#validation) for UI changes.
