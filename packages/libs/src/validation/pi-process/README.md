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

- Create fixture contents under `createValidationWorkspace`'s `work`, `home`, `agent`, and `tmp` directories. Pass an async `prepare(directory)` callback as its second argument to seed consumer-specific files. The workspace is returned only after that callback succeeds; setup failure removes it.
- Once a constructor returns, register cleanup before starting other fallible work. `createCompileCaches` also removes its directory if setup fails before returning.
- Select offline providers and resource flags explicitly, and start the process through the chosen runner.
- Supply fixture-only environment additions, not `process.env`.
- Wait for fixture processes to exit before removing the workspace.
- Guard each process run and each awaited fixture step with `STEP_TIMEOUT_MS`. Do not give a test its own limit; the root `vite.config.ts` sets one for all tests. These limits only stop a stuck test. A full suite starts many Pi processes at once, so a step can take several times as long as it does alone. Do not use shorter limits to detect hangs.

Vitest 5 does not search parent directories for a config. Every package passes the root config in its `test` script, for example `vp test run --config ../../../vite.config.ts`, so that package runs also get the hang guard and the global setup.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches. Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.
