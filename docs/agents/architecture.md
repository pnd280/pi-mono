# Code organisation and reuse

When choosing an owner or changing package boundaries, start with the [workspace architecture](../architecture.md).

## Implementation boundaries

- Keep extension registration and event handlers as Pi adapters; put substantial behaviour in modules callable without Pi.
- Keep domain policy and action effects in consumers of shared UI. Put host mounting outside `packages/libs/src/tui/components/`.
- Preserve the import boundaries enforced by [vite.config.ts](../../vite.config.ts). Lint rejects an import cycle that has a value import in each direction. A cycle closed by an `import type` passes.

## Reuse decision

Before implementing behaviour, search shared packages, relevant extensions, and Pi APIs and components.

| When…                                 | Action                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| An existing implementation fits       | Reuse it.                                                                |
| Another extension needs the behaviour | Extract it into the matching shared package; keep consumer policy local. |
| The behaviour is extension-specific   | Keep it local.                                                           |

For shared-code changes, update and verify every affected consumer.
