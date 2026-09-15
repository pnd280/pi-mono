# Validation workspaces and Pi launches

[Library index](../../../README.md#offline-validation)

## Behavior

[`@pi-mono/libs/validation/pi-process`](index.ts) is for validation code only. `createValidationWorkspace` creates a disposable directory with private `work`, `home`, `agent`, and `tmp` directories. It does not populate fixtures or remove the workspace.

`createPiLaunch` prepares an installed Pi launch without starting a process. It isolates home, agent, and temporary directories and builds an environment without inheriting user credentials or settings. Storage locations and offline settings take precedence over supplied environment additions.

`resolvePiExecutable` reads the installed package manifest and requires a nonempty `bin.pi` string. It returns the executable path without starting Pi or creating directories.

Environment isolation does not restrict filesystem access or tool execution.

## Caller responsibilities

Create fixture contents, select offline providers and resource flags explicitly, and start the process through the chosen runner. Supply fixture-only environment additions, not `process.env`.

Wait for fixture processes to exit before removing the workspace.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches. Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.

## Validation

Use the [package validation commands](../../../README.md#validation).
