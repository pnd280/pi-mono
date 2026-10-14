# Built-in codemode adapter

[Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

The adapter matches Pi's built-in `codemode` only: tool name `codemode`, `builtin` source with path `builtin:codemode`, and parameters with a required string `code`. Pi has no public schema-identity check for it, so provenance relies on the synthetic built-in source path.

SDK registrations through `createCodemodeExtension()` get an unverifiable `<inline:…>` source and keep Pi's own renderer. Replacement extensions that register their own `codemode` are not specialised either. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

## Cards

Headings read "Running script", "Ran script", or "Script failed". The script follows as JavaScript-highlighted code; compact cards show up to 10 rows, or all 11 when only one row would be omitted, within the [heading formatting limit](../../../../docs/presentation.md#resource-limits), with an expansion hint for omitted source.

The result lists the script's nested calls from `details.calls`, including partial results while the script runs. Each row shows a status icon (`…` running, `✓` success, `✗` failure, `⊘` cancelled), the tool name, Pi's argument preview, and any reported duration or model-call cost. Compact cards show the latest 8 calls, one row each; expansion shows every call with wrapped arguments and error previews. Multiple calls with positive costs add a "Model calls" total.

The output follows without Pi's `Script completed`/`Script failed` header, which is hidden only as the first text block. Output from separate `text()` calls shares one compact preview. Failed scripts keep Pi's error output. Compact cards name `details.fullOutputPath` as "Saved output", like other cards; expanded output already ends with Pi's reference.

## Summary mode

Each script counts once as `ran 1 script`, with failures as `(1 failed)`. Nested calls do not count: they never reach the transcript, and their truncated argument previews cannot identify files.

## Limitations

The adapter never runs scripts, reads saved output, or parses argument previews. Nested edits show no diffs because their changes are not observed. Results without valid `details.calls` omit the call list.

## Validation

Run [package validation](../../../../README.md#validation); colocated tests build the fixture from Pi's registered `codemode` definition, and the [install suite](../../../host/install.test.ts) loads `builtin:codemode` in a real session.
