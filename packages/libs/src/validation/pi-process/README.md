# Validation workspaces and Pi launches

[Offline validation](../../../README.md#offline-validation)

Validation tests must launch installed Pi without the user's credentials or settings, and must remove what each launch leaves behind. Validation-only [`@pi-mono/libs/validation/pi-process`](index.ts) prepares private disposable workspaces and isolated Pi launches.

## Behaviour

- `createPiLaunch` prepares installed Pi but never starts it. The launch inherits no user credentials or settings.
- Storage and offline settings override supplied environment additions.
- Environment isolation does not restrict filesystem access or tool execution.

## Shared compile caches

During a Vitest run of the root config, every new workspace links the same compiled-code caches, so launches do not compile Pi and its extensions again. The [compile-cache guide](../../../docs/pi-process.md) states what launches share, when caches start empty, and why concurrent launches can share them.

## Caller responsibilities

- Supply fixture-only environment additions, not `process.env`.
- Once a constructor returns, register cleanup before you start other fallible work. `createCompileCaches` also removes its directory if setup fails before it returns.
- Wait for fixture processes to exit before you remove the workspace.
- Create fixture contents under `createValidationWorkspace`'s `work`, `home`, `agent`, and `tmp` directories. Pass an async `prepare(directory)` callback as its second argument to seed consumer-specific files. The workspace is returned only after that callback succeeds, and setup failure removes it.
- Select offline providers and resource flags explicitly, and start the process through the chosen runner.
- Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.

### Time limits

- Guard each process run and each awaited fixture step with `STEP_TIMEOUT_MS`. These limits only stop a stuck test.
- Do not give a test its own limit. The root `vite.config.ts` sets one for all tests.
- Do not use shorter limits to detect hangs. A full suite starts many Pi processes at once, so a step can take several times as long as it does alone.

Vitest 5 does not search parent directories for a config. Every package passes the root config in its `test` script, for example `vp test run --config ../../../vite.config.ts`, so that package runs also get the hang guard and the global setup.

Related: the [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches.
