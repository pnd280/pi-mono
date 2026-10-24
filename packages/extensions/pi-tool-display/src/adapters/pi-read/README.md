# pi-read adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Selective reads from [`pi-read`](../../../../pi-read/README.md) group like native reads, and expanded cards highlight the selected lines. See [selective read cards](../../../docs/tools.md#selective-read).

## Compatibility and selection

`piSelectiveReadAdapter(toolInfo)` recognises the workspace [`pi-read`](../../../../pi-read/README.md) extension's `read` tool by package provenance and its parameter schema. For [standalone integration](../../../docs/renderers.md#explicit-contracts), pass `selectiveReadDisplayAdapter` from `pi-tool-display/adapters`.

Schema recognition checks integer coordinate types, required fields, and selection strictness in the [projected tool schema](../../../../../libs/src/tool-schema/README.md). It does not require provider-unsupported numeric bounds; argument validation still enforces positive safe integers and ordered ranges.

[Automatic selection](../../../docs/adapters.md#automatic-selection) uses this adapter. Use [renderer overrides](../../../README.md#configuration) to retain the extension's own renderers or force generic cards. The [adapter contract](contract.md) covers argument normalisation, the result contract, and selection highlights.

## Validation

Run the [installed-CLI compatibility check](../../host/install-cli.test.ts), and follow the [pi-read terminal check](../../../docs/validation.md#pi-read) for visual checks.
