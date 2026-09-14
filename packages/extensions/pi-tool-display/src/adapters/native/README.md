# Native adapter

## Compatibility and selection

`nativeAdapter(name)` supports `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, and `write`. Passing it to the [standalone factory](../../../docs/renderers.md#explicit-contracts) asserts compatibility; it does not verify ownership or install native execution observation.

Automatic selection requires verified native ownership. Execution observation remains a separate host integration with its own provenance checks; see [observation and saved history](../../../README.md#observation-and-saved-history) and [automatic selection](../../../docs/adapters.md#automatic-selection).

## Argument and result contract

Native contracts use `path`, read `offset`/`limit`, search `pattern`/scope, shell `command`/`timeout`, and successful edit **`details.patch` in unified format**. Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

## Display behavior and limitations

Read, search, and list calls can participate in exploration groups. Concrete file targets follow the shared [path layout](../../../docs/renderers.md#card-layout).

Native image captions suppress equivalent generated fallback descriptions without changing the retained result. Native model-support and image conversion/resize omission warnings remain visible in compact standalone and grouped reads, and appear once in expanded bodies. Patch and live/saved-text previews retain image fallback notices when Pi's native image display is unavailable or disabled.

The native `(no output)` placeholder uses `dim`. Nonzero-exit/timeout diagnostics use `error`; process output preceding a native failure footer retains its own styling.

### Text-envelope provenance

In retained shell results, literal process output matching a native placeholder or truncation trailer receives that envelope's styling; the text alone does not establish its provenance.

Live and saved-output previews [distinguish generated omissions from process text](../../../docs/renderers.md#semantic-colors).

## Validation

Run the [shared terminal scenarios and host interaction checks](../../../docs/validation.md), including the [platform-specific checks](../../../docs/validation.md#platform-limitations) for images and PowerShell.
