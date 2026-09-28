# Native adapter

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. [Standalone use](../../../docs/renderers.md#explicit-contracts) asserts compatibility without verifying provenance or observing execution.

[Automatic selection](../../../docs/adapters.md#automatic-selection) requires verified native provenance. [Execution observation](../../../README.md#observation-and-saved-history) has separate host provenance checks.

## Arguments and results

Successful edits use `details.patch` in unified format. Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

Concrete targets use Pi's Unicode-space normalization before lexical resolution for headings, exploration scopes, and summary identities. Arguments remain unchanged; search patterns and globs remain literal. Selective-read shares this native path policy; custom adapters and FFF filters do not inherit it.

## Display

See the shared [exploration-group rules](../../../docs/presentation.md#groups), [target formatting](../../../docs/presentation.md#card-layout), and [result presentation](../../../docs/presentation.md#results).

Observed shells show recorded status/duration beside compact and expanded output, e.g. `Exit 0 · 12ms`. Missing codes stay unknown; ordinary text never establishes status. Unrecorded history has no status/timing summary.

Native captions suppress duplicate fallback descriptions without mutating results. Unsupported-model and conversion/resizing omission warnings remain in compact cards/groups and appear once in expanded bodies. Patch/live/saved previews retain fallbacks when Pi image display is unavailable or disabled.

Recognized read continuation and byte-limit fallback instructions remain visible in compact cards/groups. Expansion restores them once in the retained text.

The native `(no output)` placeholder uses `dim`. Nonzero-exit and timeout diagnostic bodies and failure markers use `error`. Process output preceding a native failure footer retains its own styling.

### Text-envelope provenance

In retained native results, literal text identical to a complete native placeholder or trailer cannot be distinguished from the generated envelope. Read recovery notices use the same exact trailer recognition as expanded bodies; similar phrases embedded in source remain source. Shell placeholder/truncation lookalikes receive the same styling. None of these text matches establishes an operation outcome.

Live and saved-output previews [distinguish generated omissions from process text](../../../docs/presentation.md#notices-and-colors).

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
