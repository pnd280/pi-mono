# Ownership and reuse

## Ownership

- `packages/extensions/<name>/`: one workspace package per extension.
- `packages/tui-components/`: reusable TUI components.
- `packages/utils/`: pure utilities and helpers only; no state, I/O, or runtime abstractions.
- `packages/libs/`: shared stateful code and abstractions.

Keep registration and event handlers as pi adapters; put substantial behavior in modules callable without a pi session.

Shared packages stay independent of individual extensions.

## Reuse decision

Before implementing behavior, search the shared packages, relevant extensions, and pi's APIs/components for an existing implementation.

- **Reuse** when an existing implementation fits.
- **Extract** when another extension needs behavior currently owned by one extension. Move the common contract into the appropriate shared package, keeping each consumer's policy local.
- **Keep local** when behavior is extension-specific.

For shared-code changes, account for every affected consumer: update its usage where necessary and verify its behavior.
