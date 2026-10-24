# Code organisation and reuse

When choosing an owner or changing package boundaries, start with the [workspace architecture](../architecture.md).

## Implementation boundaries

- Keep extension registration and event handlers as Pi adapters; put substantial behaviour in modules callable without Pi.
- Keep domain policy and action effects in consumers of shared UI. Put host mounting outside `packages/libs/src/tui/components/`.
- Lint enforces the import boundaries in [vite.config.ts](../../vite.config.ts). It rejects an import cycle that has a value import in each direction; a cycle closed by an `import type` passes.

## Reuse decision

Before implementing behaviour, search shared packages, relevant extensions, and Pi APIs and components.

| When…                                 | Action                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| An existing implementation fits       | Reuse it.                                                                |
| Another extension needs the behaviour | Extract it into the matching shared package; keep consumer policy local. |
| The behaviour is extension-specific   | Keep it local.                                                           |
