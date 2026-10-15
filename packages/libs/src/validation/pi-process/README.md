# Validation workspaces and Pi launches

[Library index](../../../README.md#offline-validation)

Launch installed Pi in isolated disposable directories for validation.

## Behaviour

Validation-only [`@pi-mono/libs/validation/pi-process`](index.ts) prepares private disposable workspaces and isolated Pi launches.

`createPiLaunch` prepares but never starts installed Pi, inheriting no user credentials or settings. Storage and offline settings override supplied environment additions.

Environment isolation does not restrict filesystem access or tool execution.

## Shared compile caches

Pi keeps two content-keyed caches of compiled code under its `TMPDIR`: jiti's extension transpiles in `jiti` and Node's module compile cache in `node-compile-cache`. Without sharing, every launch in a new workspace compiles Pi and its extensions again.

When `PI_MONO_VALIDATION_COMPILE_CACHES` names a directory from `createCompileCaches`, `createValidationWorkspace` links both caches into the new workspace's `tmp` directory. Launches still get their own `HOME`, `TMPDIR`, and agent directory, so they share only compiled code, never settings, sessions, or other temporary files.

The [Vitest global setup](global-setup.ts) in the root [vite.config.ts](../../../../../vite.config.ts) creates one cache directory under the system temporary directory for each test run, sets the variable for the workers, and removes the directory at teardown. Launches from other processes, such as manual launchers, start with empty caches.

Concurrent launches can share the caches:

- jiti uses a cache file only when the file ends with the source-hash marker, which it writes last. A reader therefore ignores a partly written file, and concurrent writers of one file write identical bytes while its source is unchanged.
- Node writes each compile-cache entry to a temporary file, renames it into place, and verifies checksums when it reads an entry.

Edge cases: jiti does not write atomically, so if a loaded source file changes during a run, concurrent writers can leave a cache file that mixes both versions. An interrupted run leaves its cache directory behind, as it does its workspaces.

## Caller responsibilities

Create fixture contents under `createValidationWorkspace`'s `work`, `home`, `agent`, and `tmp` directories. Select offline providers and resource flags explicitly, and start the process through the chosen runner. Supply fixture-only environment additions, not `process.env`.

Wait for fixture processes to exit before removing the workspace.

Vitest 5 does not search parent directories for a config. A package whose tests launch Pi passes the root config in its `test` script, `vp test run --config ../../../vite.config.ts`, so that package runs also get the global setup.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches. Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.
