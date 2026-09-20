# Native adapter

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. [Standalone use](../../../docs/renderers.md#explicit-contracts) asserts compatibility without verifying provenance or observing execution.

[Automatic selection](../../../docs/adapters.md#automatic-selection) requires verified native provenance. [Execution observation](../../../README.md#observation-and-saved-history) has separate host provenance checks.

## Arguments and results

Successful edits use `details.patch` in unified format. Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

## Display

See the shared [exploration-group rules](../../../docs/presentation.md#groups), [target formatting](../../../docs/presentation.md#card-layout), and [result presentation](../../../docs/presentation.md#results).

Observed shells show recorded status/duration beside compact and expanded output, e.g. `Exit 0 · 12ms`. Missing codes stay unknown; ordinary text never establishes status. Unrecorded history has no status/timing summary.

Native captions suppress duplicate fallback descriptions without mutating results. Unsupported-model and conversion/resizing omission warnings remain in compact cards/groups and appear once in expanded bodies. Patch/live/saved previews retain fallbacks when Pi image display is unavailable or disabled.

The native `(no output)` placeholder uses `dim`. Nonzero-exit and timeout diagnostic bodies and failure markers use `error`. Process output preceding a native failure footer retains its own styling.

### Text-envelope provenance

In retained shell results, process output that matches a native placeholder or truncation trailer receives the same styling. The text alone cannot identify its source.

Live and saved-output previews [distinguish generated omissions from process text](../../../docs/presentation.md#notices-and-colors).

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
