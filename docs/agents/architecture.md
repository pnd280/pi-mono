# Code organization and reuse

[Workspace architecture](../architecture.md)

## Package responsibilities

- `packages/extensions/<name>/`: one workspace package per extension.
- `packages/utils/`: pure helpers without state, I/O, or runtime abstractions.
- `packages/libs/`: shared stateful code and abstractions, plus TUI infrastructure under `src/tui/`.
- `packages/libs/src/tui/components/`: reusable TUI components and views. Shared browsers manage layout and interaction. Extensions supply data, formatting, domain policies, and action effects. Host mounting stays outside `components/`.

Keep registration and event handlers as Pi adapters. Put substantial behavior in modules callable without a Pi session.

Shared packages stay independent of individual extensions.

## Reuse decision

Before implementing behavior, search the shared packages, relevant extensions, and Pi's APIs and components for an existing implementation.

- **Reuse** when an existing implementation fits.
- **Extract** when another extension needs behavior implemented in one extension. Move the common contract into the matching shared package, keeping each consumer's policy local.
- **Keep local** when behavior is extension-specific.

For shared-code changes, account for every affected consumer: update affected usages and verify its behavior.
