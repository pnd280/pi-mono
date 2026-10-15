# Shared compile caches for validation launches

[validation/pi-process](../src/validation/pi-process/README.md) · [@pi-mono/libs](../README.md)

Pi keeps two content-keyed caches of compiled code under its `TMPDIR`: jiti's extension transpiles in `jiti` and Node's module compile cache in `node-compile-cache`. Without sharing, every launch in a new workspace compiles Pi and its extensions again.

## How launches share the caches

When `PI_MONO_VALIDATION_COMPILE_CACHES` names a directory from `createCompileCaches`, `createValidationWorkspace` links both caches into the new workspace's `tmp` directory. Launches still get their own `HOME`, `TMPDIR`, and agent directory, so they share only compiled code, never settings, sessions, or other temporary files.

The [Vitest global setup](../src/validation/pi-process/global-setup.ts) in the root [vite.config.ts](../../../vite.config.ts) creates one cache directory under the system temporary directory for each test run, sets the variable for the workers, and removes the directory at teardown. Launches from other processes, such as manual launchers, start with empty caches.

## Concurrent launches

Concurrent launches can share the caches:

- jiti uses a cache file only when the file ends with the source-hash marker, which it writes last. A reader therefore ignores a partly written file, and concurrent writers of one file write identical bytes while its source is unchanged.
- Node writes each compile-cache entry to a temporary file, renames it into place, and verifies checksums when it reads an entry.

Edge cases: jiti does not write atomically, so if a loaded source file changes during a run, concurrent writers can leave a cache file that mixes both versions. An interrupted run leaves its cache directory behind, as it does its workspaces.
