# Validation workspaces and Pi launches

[Offline validation](../../../README.md#offline-validation)

Launch installed Pi in isolated disposable directories for validation.

## Behaviour

Validation-only [`@pi-mono/libs/validation/pi-process`](index.ts) prepares private disposable workspaces and isolated Pi launches.

- `createPiLaunch` prepares installed Pi but never starts it. The launch inherits no user credentials or settings.
- Storage and offline settings override supplied environment additions.
- Environment isolation does not restrict filesystem access or tool execution.

## Shared compile caches

During a Vitest run of the root config, every new workspace links the same compiled-code caches, so launches do not compile Pi and its extensions again. Launches share only compiled code, never settings, sessions, or other temporary files. Launches from other processes, such as manual launchers, start with empty caches. To learn how the caches are linked and why concurrent launches can share them, read the [compile-cache guide](../../../docs/pi-process.md).

## Caller responsibilities

- Create fixture contents under `createValidationWorkspace`'s `work`, `home`, `agent`, and `tmp` directories.
- Select offline providers and resource flags explicitly, and start the process through the chosen runner.
- Supply fixture-only environment additions, not `process.env`.
- Wait for fixture processes to exit before removing the workspace.

Vitest 5 does not search parent directories for a config. A package whose tests launch Pi passes the root config in its `test` script, `vp test run --config ../../../vite.config.ts`, so that package runs also get the global setup.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches. Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.
