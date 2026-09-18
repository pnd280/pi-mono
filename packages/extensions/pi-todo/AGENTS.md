# pi-todo development

## Code navigation

- `src/index.ts` adapts Pi registration and lifecycle events; `runtime.ts` owns activation.
- `reducer.ts`, `hierarchy.ts`, and `controller.ts` own task transitions and state isolation.
- `session-state.ts`, `limits.ts`, and `mutation-schema.ts` validate replay and mutation boundaries.
- `tool.ts` adapts model input and returns replayable results; `tool-schema.ts` defines the model-facing schema.
- `commands.ts`, `todos-view.ts`, and `todo-overlay.ts` own task navigation and widget policy.

## Constraints

Keep hierarchy independent of status and dependencies. Mutations must remain atomic, and every emitted result must retain the full replayable state. Tool-result details are the only durable task storage.

Leave tool card rendering to the host. Do not attach renderer fields to the tool definition.

Reuse shared terminal sanitization, text layout, and custom-UI mounting. Keep task-browser selection, widget status presentation, and suppression ownership local. The fullscreen custom view uses Pi's overlay route so paging does not require global keybinding changes.

See the [package behavior](README.md) and [workspace reuse guidance](../../../docs/agents/architecture.md).

## Validation

Follow the [workspace verification workflow](../../../docs/agents/verification.md) using package name `pi-todo`. Tests are colocated with their owning modules. See [interactive checks](README.md#validation) for UI changes.
