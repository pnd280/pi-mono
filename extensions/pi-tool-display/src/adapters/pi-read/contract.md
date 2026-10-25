# pi-read adapter contract

[pi-read adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change argument or result handling. [Selective read cards](../../../docs/tools.md#selective-read) describes what users see.

## Arguments and results

Use [read arguments](../../../../pi-read/README.md#usage); optional `null` values, including selection coordinates, count as omitted to match Pi normalisation. Unknown top-level fields are ignored for display, matching read execution, without changing retained arguments. Known fields and nested `selection` remain validated; unknown selection fields are rejected.

Result provenance and native source windows use the producer-owned [`pi-read/result` contract](../../../../pi-read/docs/result.md). Display requires a selection when a validated preview is present, rejects invalid contracts rather than recovering them, and hides only the recorded preview.

In automatic mode, incompatible arguments or results use the shared [invalid-input fallback](../../../docs/renderers.md#invalid-and-partial-input).

## Display

Targets share [native path normalisation](../native/contract.md#arguments-and-results) without rewriting retained arguments.

The shared interpretation supplies per-block highlights from the raw source part after native diagnostics are separated. Terminal sanitisation and tab expansion remain display policy. Trailer recognition has the native [text-envelope provenance limits](../native/contract.md#text-envelope-provenance).
