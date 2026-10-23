# pi-read adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Selective reads from [`pi-read`](../../../../pi-read/README.md) group like native reads, and expanded cards highlight the selected lines. See [selective read cards](../../../docs/tools.md#selective-read).

## Compatibility and selection

`piSelectiveReadAdapter(toolInfo)` recognises the workspace [`pi-read`](../../../../pi-read/README.md) extension's `read` tool by package provenance and its parameter schema. For [standalone integration](../../../docs/renderers.md#explicit-contracts), pass `selectiveReadDisplayAdapter` from `pi-tool-display/adapters`.

Schema recognition checks integer coordinate types, required fields, and selection strictness in the [projected tool schema](../../../../../libs/src/tool-schema/README.md). It does not require provider-unsupported numeric bounds; argument validation still enforces positive safe integers and ordered ranges.

[Automatic selection](../../../docs/adapters.md#automatic-selection) uses this adapter. Use [renderer overrides](../../../README.md#configuration) to retain the extension's own renderers or force generic cards.

## Arguments and results

Use [read arguments](../../../../pi-read/README.md#usage); optional `null` values, including selection coordinates, count as omitted to match Pi normalisation. Unknown top-level fields are ignored for display, matching read execution, without changing retained arguments. Known fields and nested `selection` remain validated; unknown selection fields are rejected.

Result provenance and native source windows use the producer-owned [`pi-read/result` contract](../../../../pi-read/docs/result.md). Display requires a selection when a validated preview is present, rejects invalid contracts rather than recovering them, and hides only the recorded preview.

In automatic mode, incompatible arguments or results use the shared [invalid-input fallback](../../../docs/renderers.md#invalid-and-partial-input).

## Display

[Selective read cards](../../../docs/tools.md#selective-read) describes what users see. Targets share [native path normalisation](../native/README.md#arguments-and-results) without rewriting retained arguments.

The shared interpretation supplies per-block highlights from the raw source part after native diagnostics are separated. Terminal sanitisation and tab expansion remain display policy. Trailer recognition has the native [text-envelope provenance limits](../native/README.md#text-envelope-provenance).

## Validation

Run the [installed-CLI compatibility check](../../host/install-cli.test.ts).

For visual checks, load both extensions. Include repeated reads, tabs, wide characters, multiline selections, selections outside the read window, images, and failed reads.

| Do                                                                                     | Expect                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Expand and collapse groups at narrow and wide terminal sizes in light and dark themes. | Expanded reads show source once, without the appended preview.   |
| Replay the session and expand a read.                                                  | The selection remains highlighted without repeating the preview. |
