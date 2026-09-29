# Code organization and reuse

[Workspace architecture](../architecture.md)

## Package responsibilities

- `packages/extensions/<name>/`: one package per extension, except [pi-miscs](../../packages/extensions/pi-miscs/README.md), which bundles small, typically single-file extensions. Keep registration and event handlers as Pi adapters; put substantial behavior in modules callable without Pi.
- `packages/utils/`: pure helpers without state, I/O, or runtime abstractions.
- `packages/libs/`: shared stateful code and abstractions, including TUI infrastructure under `src/tui/`.
- `packages/libs/src/tui/components/`: reusable components and views. Shared browsers own layout and interaction; extensions supply data, formatting, domain policy, and action effects. Keep host mounting outside `components/`.

Keep shared packages independent of individual extensions.

## Reuse decision

Before implementing behavior, search shared packages, relevant extensions, and Pi APIs and components.

- **Reuse** when an existing implementation fits.
- **Extract** behavior needed by another extension into the matching shared package; keep consumer policy local.
- **Keep local** when behavior is extension-specific.

For shared-code changes, update and verify every affected consumer.
