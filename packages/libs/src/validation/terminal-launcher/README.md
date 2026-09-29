# Validation terminal launcher

[Library index](../../../README.md#offline-validation)

## Behavior

Validation-only [`runTerminalLauncher`](index.ts) (`@pi-mono/libs/validation/terminal-launcher`) accepts `regular`/`fullscreen`, immediately followed by optional `--reuse <directory>`. `--help` shows consumer help without creating a workspace.

Children inherit terminal I/O and extra Pi arguments. Returns the exit code, or `1` without a numeric code; launch failures propagate.

## Caller responsibilities

Supply help text, fixture creation, directory descriptions, and a `launch` callback. Validate the fixture directory in `launch` before returning a configuration, including when reusing a directory.

Select offline providers and resource flags in the consumer. [Pi launch preparation](../pi-process/README.md) supplies isolated directories and environment settings but does not restrict filesystem access or tool execution.

Own scenarios; wait for processes to exit before directory removal. See [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) launch configurations.
