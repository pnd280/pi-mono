# Pi compatibility for maintainers

[pi-read](../README.md)

> Last verified against Pi 1.5.2 with the package checks, native-read tests that use a real typed tool context and the display adapter, and a source review of the Pi 1.5.1 to 1.5.2 changes, which leave `pi-schema` and the native read tool unchanged. Not covered: the offline probes that compare `validateToolArguments` with the extended schema and the native read results, which last ran on Pi 1.5.0 and 1.5.1; manual image checks, manual appearance checks, schema checks with live providers, and cancellation of a streamed read.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and the [manual appearance checks](testing.md#manual-checks).
2. When tool schemas, shared arguments and results, or renderer integration change, also check `pi-tool-display`, including its installed-CLI test.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Selection previews must preserve native file access, results, and rendering fallbacks.

### Native delegation

[Native delegation](../src/tool.ts):

- [ ] The supplied tool definition owns the extended native schema and the preserved prompt metadata.
- [ ] The complete `ExtensionToolContext` that Pi passes to `execute` still matches what the native tool expects.
- [ ] Execution arguments, cancellation, images, the output schema, and the original content, structured content, and details pass through.
- [ ] Execution never rereads the file.

### Schema

[Schema compatibility](../../../libs/src/tool-schema/README.md):

- [ ] Serialised parameters leave out runtime metadata and unsupported integer bounds.
- [ ] Execution still validates positive safe integers before file access.

### Results

[Shared result interpretation](result.md):

- [ ] The read window and the code-point selection stay independent.
- [ ] The preview stays within five lines and 500 code points per line.
- [ ] Truncation and continuation notices are excluded from the source.
- [ ] Preview provenance, invalidity reporting, and borrowed source recovery still satisfy the shared contract.
- [ ] Aggregate and per-block source coordinates preserve native block joins and diagnostic separation.

### Rendering

- [ ] [Rendering](../src/render.ts) and the [display adapter](../../pi-tool-display/src/adapters/pi-read/README.md) keep context and highlight selections without repeating the preview.

## Limitations

- In Pi 1.5.0 to 1.5.2, Pi validates tool arguments with `@earendil-works/pi-schema` and coerces them first. Numeric strings in `selection` become integers, as in Pi 1.4.0, but a fractional coordinate such as `1.5` is now truncated to `1` instead of rejected, and Pi's messages change from `must be integer` to `expected integer, got string`. The extension's own check still runs on the coerced value in `execute`, before file access, and rejects zero, negative, unsafe, and reversed coordinates and unknown fields. Native `offset` and `limit` are numbers, so fractional windows still reach Pi's slicing arithmetic. Pi 1.5.1 and 1.5.2 reject a non-finite `offset` or `limit`, such as `1e400`, during validation.
- In Pi 1.5.1 and 1.5.2, the native tool streams a text file when `offset` is an integer and `limit` is a non-negative integer. It loads the whole file for other windows, and for file operations without `createReadStream`. Both paths give the same content, notices, and details. The [native-read tests](../src/tool.test.ts) supply `access` and `readFile` only, so they run the whole-file path.
- In Pi 1.4.0 to 1.5.2, Pi reports a failed image conversion as text, without typed image metadata. The extension recognises Pi's `Read image file [image/` prefix, so a text file that starts with exactly that prefix looks the same. This lasts until Pi exposes a way to tell the results apart.
- The extension replaces `read`, and [can't run alongside another replacement](../README.md#other-read-extensions). Revisit native selection support, or public decoration APIs, that could remove the replacement while keeping the source and window behaviour and the display integration. Pi 1.5.2 adds neither.
- In Pi 1.5.0 to 1.5.2, tool render contexts supply `keyHint`, and the renderer uses it for its expansion hint instead of the imported function.
- Pi 1.4.0 to 1.5.2 export `formatReadLineRange`, but it formats `:start-end` suffixes, not the clamped "lines" and "from line" labels of the [renderer](../src/render.ts), so the renderer keeps its own window label.
