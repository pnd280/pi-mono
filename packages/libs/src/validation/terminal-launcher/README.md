# Validation terminal launcher

[Library index](../../../README.md#offline-validation)

## Behavior

[`@pi-mono/libs/validation/terminal-launcher`](index.ts) exports `runTerminalLauncher` for validation code only. It accepts `regular` or `fullscreen`, followed immediately by an optional `--reuse <directory>`. `--help` displays the consumer's help text without creating a workspace.

The launcher creates or reuses a directory, asks the consumer for a launch configuration, and starts the child with inherited terminal I/O. It forwards extra Pi arguments and returns the child's exit code, or `1` if the child exits without a numeric code. Launch failures propagate to the caller.

## Caller responsibilities

Supply help text, fixture creation, directory descriptions, and a `launch` callback. Validate the fixture directory in `launch` before returning a configuration, including when reusing a directory.

Select offline providers and resource flags in the consumer. [Pi launch preparation](../pi-process/README.md) supplies isolated directories and environment settings but does not restrict filesystem access or tool execution.

Define scenarios in the consumer. Wait for fixture processes to exit before removing their directories. The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures provide launch configurations.

## Validation

Use the [package validation commands](../../../README.md#validation).
