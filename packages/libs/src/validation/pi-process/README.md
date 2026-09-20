# Validation workspaces and Pi launches

[Library index](../../../README.md#offline-validation)

## Behavior

Validation-only [`@pi-mono/libs/validation/pi-process`](index.ts): `createValidationWorkspace` creates private disposable `work`, `home`, `agent`, and `tmp`, without populating/removing fixtures.

`createPiLaunch` prepares, never starts, installed Pi with isolated directories/environment, inheriting no credentials/settings. Storage/offline settings override supplied environment additions.

Environment isolation does not restrict filesystem access or tool execution.

## Caller responsibilities

Create fixture contents, select offline providers and resource flags explicitly, and start the process through the chosen runner. Supply fixture-only environment additions, not `process.env`.

Wait for fixture processes to exit before removing the workspace.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures prepare launches. Use the [terminal launcher](../terminal-launcher/README.md) for interactive validation.

## Validation

Use the [package validation commands](../../../README.md#validation).
