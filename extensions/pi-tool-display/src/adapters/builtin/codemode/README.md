# Built-in codemode adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

Scripts from Pi's built-in `codemode` tool appear as cards with the highlighted script and a list of the calls it made. See [codemode cards](../../../../docs/tools.md#codemode).

## Compatibility and selection

The adapter matches Pi's built-in `codemode` only: tool name `codemode`, `builtin` source with path `builtin:codemode`, and parameters with a required string `code`. Pi has no public schema-identity check for it, so provenance relies on the synthetic built-in source path.

SDK registrations through `createCodemodeExtension()` get an unverifiable `<inline:…>` source and keep Pi's own renderer. Replacement extensions that register their own `codemode` are not specialised either. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

The [adapter contract](contract.md) lists the result details behind each card.

## Validation

The [colocated test](index.test.ts) checks that standalone rendering leaves script arguments unchanged. The [install suite](../../../host/install.test.ts) loads `builtin:codemode` in a real session and checks delegated execution. Check the script time by hand with the [codemode terminal check](../../../../docs/validation.md#codemode).
