# Native adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Specialised cards cover Pi's own tools: shell previews with status and duration, file diffs, and grouped reads and searches. See [native tool cards](../../../docs/tools.md#native-tools).

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. [Standalone use](../../../docs/renderers.md#explicit-contracts) asserts compatibility without verifying provenance or observing execution.

[Automatic selection](../../../docs/adapters.md#automatic-selection) requires verified native provenance. [Execution observation](../../../docs/recording.md#observation) has separate host provenance checks.

The [adapter contract](contract.md) covers patches, target normalisation, and text-envelope recognition.

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
