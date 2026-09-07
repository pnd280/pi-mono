# Ownership and reuse

## Ownership

- `packages/extensions/<name>/`: one workspace package per extension; the parent directory groups them.
- `packages/tui-components/`: reusable TUI components.
- `packages/utils/`: pure utilities and helpers only; no state, I/O, or runtime abstractions.
- `packages/libs/`: shared stateful code and abstractions.

Keep registration and event handlers as pi adapters; put substantial behavior in modules callable without a pi session. Keep extension-specific policy and glue with their extension.

Shared packages stay independent of individual extensions. Expose their supported behavior through `exports`; consumers import that API. Create packages to house real functionality.

## Reuse decision

Before implementing behavior, search the shared packages, relevant extensions, and pi's APIs/components for an existing implementation. Choose based on the required contract:

- **Reuse** when an existing implementation fits.
- **Extract** when another extension needs behavior currently owned by one extension. Move the common contract into the appropriate shared package, keeping each consumer's policy local.
- **Keep local** when behavior is extension-specific. Generalize when actual consumers establish a shared contract.

For shared-code changes, account for every affected consumer: update its usage where necessary and verify its behavior. Extraction is complete when those consumers use the shared implementation and their checks pass; report any consumer left unverified.
