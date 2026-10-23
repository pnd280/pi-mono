# Native adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Specialised cards cover Pi's own tools: shell previews with status and duration, file diffs, and grouped reads and searches. See [native tool cards](../../../docs/tools.md#native-tools).

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. [Standalone use](../../../docs/renderers.md#explicit-contracts) asserts compatibility without verifying provenance or observing execution.

[Automatic selection](../../../docs/adapters.md#automatic-selection) requires verified native provenance. [Execution observation](../../../README.md#what-is-recorded) has separate host provenance checks.

## Arguments and results

Successful edits use `details.patch` in unified format. Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

Concrete targets use Pi's Unicode-space normalisation before lexical resolution for headings, exploration scopes, and summary identities. Arguments remain unchanged; search patterns and globs remain literal. Selective-read shares this native path policy; custom adapters and FFF filters do not inherit it.

## Display

[Native tool cards](../../../docs/tools.md#native-tools) describes what users see. The shared exploration-group, target-formatting, and result rules of [tool card presentation](../../../docs/presentation.md) apply.

### Text-envelope provenance

In retained native results, literal text identical to a complete native placeholder or trailer cannot be distinguished from the generated envelope. Read recovery notices use the same exact trailer recognition as expanded bodies; similar phrases embedded in source remain source. Text that looks like a shell placeholder or truncation notice receives the same styling. None of these text matches establishes an operation outcome.

Live and saved-output previews [distinguish generated omissions from process text](../../../docs/presentation.md#notices-and-colours).

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
