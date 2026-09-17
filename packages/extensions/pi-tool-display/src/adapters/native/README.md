# Native adapter

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. Passing it to the [standalone factory](../../../docs/renderers.md#explicit-contracts) asserts compatibility. It does not verify provenance or install native execution observation.

[Automatic selection](../../../docs/adapters.md#automatic-selection) requires verified native provenance. [Execution observation](../../../README.md#observation-and-saved-history) has separate host provenance checks.

## Arguments and results

| Operation       | Fields                            |
| --------------- | --------------------------------- |
| File targeting  | `path`                            |
| Read range      | `offset`, `limit`                 |
| Search          | `pattern` and scope arguments     |
| Shell           | `command`, `timeout`              |
| Successful edit | `details.patch` in unified format |

Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

## Display

Adjacent read, search, and list calls form [exploration groups](../../../docs/presentation.md#groups) when their normalized directories match. Reads use their file's parent directory. Searches and lists use the supplied directory or `.`. Single calls use ordinary cards.

Concrete file targets follow the shared [target rules](../../../docs/presentation.md#card-layout).

Native image captions suppress equivalent generated fallback descriptions without changing the retained result. Warnings about models without image support or images omitted during conversion or resizing remain visible in collapsed cards, including groups. These warnings appear once in expanded bodies. Patch, live-output, and saved-output previews retain image fallback notices when Pi's native image display is unavailable or disabled.

The native `(no output)` placeholder uses `dim`. Nonzero-exit and timeout diagnostic bodies and failure markers use `error`. Process output preceding a native failure footer retains its own styling.

### Text-envelope provenance

In retained shell results, process output that matches a native placeholder or truncation trailer receives the same styling. The text alone cannot identify its source.

Live and saved-output previews [distinguish generated omissions from process text](../../../docs/presentation.md#notices-and-colors).

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
