# Code organization and reuse

When choosing an owner or changing package boundaries, start with the [workspace architecture](../architecture.md).

## Implementation boundaries

- Keep extension registration and event handlers as Pi adapters; put substantial behavior in modules callable without Pi.
- Keep domain policy and action effects in consumers of shared UI. Put host mounting outside `packages/libs/src/tui/components/`.
- Preserve the import boundaries enforced by [vite.config.ts](../../vite.config.ts).

## Reuse decision

Before implementing behavior, search shared packages, relevant extensions, and Pi APIs and components.

- **Reuse** when an existing implementation fits.
- **Extract** behavior needed by another extension into the matching shared package; keep consumer policy local.
- **Keep local** when behavior is extension-specific.

For shared-code changes, update and verify every affected consumer.
