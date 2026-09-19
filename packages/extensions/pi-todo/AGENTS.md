# pi-todo development

## Code navigation

- `src/index.ts` registers Pi handlers and `pi-todo.activity` with the [working-message coordinator](../../libs/src/working-message/README.md). `src/runtime.ts` controls activation.
- `src/reducer.ts`, `src/hierarchy.ts`, and `src/controller.ts` manage task transitions and state isolation.
- `src/session-state.ts`, `src/limits.ts`, and `src/mutation-schema.ts` validate stored state and mutations.
- `src/tool.ts` adapts model input and returns replayable results. `src/tool-schema.ts` defines the model-facing schema.
- `src/commands.ts`, `src/todos-view.ts`, and `src/todo-overlay.ts` manage task navigation, the widget, and activity text.
- `validation/` provides the offline working-message launcher and fixture contributors.

## Constraints

Keep hierarchy independent of status and dependencies. Mutations must remain atomic, and every emitted result must retain the full replayable state.

Leave tool card rendering to the host. Do not attach renderer fields to the tool definition.

Reuse shared terminal sanitization, text layout, and custom-UI mounting. Publish activity through the working-message coordinator rather than writing Pi's message directly. Keep task-browser selection, widget status presentation, and suppression ownership local. The fullscreen custom view uses Pi's overlay route so paging does not require global keybinding changes.

See the [package behavior](README.md) and [workspace reuse guidance](../../../docs/agents/architecture.md).

## Validation

Follow the [workspace verification workflow](../../../docs/agents/verification.md) using package name `pi-todo`. Tests are colocated with their owning modules. See [interactive checks](README.md#validation) for UI changes.
