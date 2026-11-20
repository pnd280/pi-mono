# Pi compatibility for maintainers

[pi-read](../README.md)

> Last verified against Pi 1.6.0 with the package checks, e2e host tests that run the native read tool, the display adapter's checks, and a source review of the Pi 1.5.2 to 1.6.0 changes. Not covered: offline probes that compare `validateToolArguments` with the extended schema and the native read results (last run on Pi 1.5.0 and 1.5.1); manual image checks; manual appearance checks; schema checks with live providers; and cancellation of a streamed read.

## Upgrade procedure

Run the [manual appearance checks](testing.md#manual-checks).

## Checklist

Selection previews must preserve native file access, results, and rendering fallbacks.

### Native delegation

[Native delegation](../src/tool.ts):

- [ ] The supplied tool definition owns the extended native schema and the preserved prompt metadata.
- [ ] The complete `ExtensionToolContext` that Pi passes to `execute` still matches what the native tool expects.
- [ ] Execution arguments and cancellation still pass through to native execution.
- [ ] Native images, original content, and details still pass through.
- [ ] The native output schema and structured content still pass through.
- [ ] Codemode still returns structured content for a tool with an output schema.
- [ ] Execution never rereads the file.

The preview goes only into content and details, so codemode receives the source without the preview.

### Schema

[Schema compatibility](../../../libs/src/tool-schema/README.md):

- [ ] Serialised parameters leave out runtime metadata and unsupported integer bounds.
- [ ] Execution still validates positive safe integers before file access.

### Results

[Shared result interpretation](result.md):

- [ ] The read window and the code-point selection stay independent.
- [ ] Truncation and continuation notices are excluded from the source.
- [ ] Preview provenance, invalidity reporting, and borrowed source recovery still satisfy the shared contract.
- [ ] Aggregate and per-block source coordinates preserve native block joins and diagnostic separation.

### Rendering

- [ ] [Rendering](../src/render.ts) and the [display adapter](../../pi-tool-display/src/adapters/pi-read/README.md) keep context and highlight selections without repeating the preview.

## Limitations

- The source review of the Pi 1.5.2 to 1.6.0 changes found `pi-schema` unchanged. The native read tool changed only its image note and the signal of its internal stream, as the items below describe.
- In Pi 1.5.0 to 1.6.0, Pi validates tool arguments with `@earendil-works/pi-schema` and coerces them first. Numeric strings in `selection` become integers, as in Pi 1.4.0, but a fractional coordinate such as `1.5` is now truncated to `1` instead of rejected, and Pi's messages change from `must be integer` to `expected integer, got string`. The extension's own check still runs on the coerced value in `execute`, before file access, and rejects zero, negative, unsafe, and reversed coordinates and unknown fields. Native `offset` and `limit` are numbers, so fractional windows still reach Pi's slicing arithmetic. The tool row receives the window arguments before coercion, so the renderer reads the window recorded in the result details. Pi 1.5.1 and 1.5.2 reject a non-finite `offset` or `limit`, such as `1e400`, during validation.
- In Pi 1.5.1 to 1.6.0, the native tool streams a text file when `offset` is omitted or an integer, `limit` is omitted or a non-negative integer, and the file operations provide `createReadStream`. It loads the whole file otherwise. Both paths give the same content, notices, and details. The [e2e tests](../validation/read.test.ts) use Pi's default file operations, except the cancellation case, which supplies `access` and `readFile` only. In Pi 1.6.0, the internal stream no longer receives the abort signal (`readLocalFileChunks` in `read.js`); the tool stops reading when its signal aborts, so `execute` still rejects with the native abort.
- In Pi 1.4.0 to 1.5.2, a read by a model without image input appends "[Current model does not support images. The image will be omitted from this request.]" to the text content. Pi 1.6.0 removes that note and sets `details.imageUnsupportedByModel` to the model ID instead, and its renderer shows the warning.
- In Pi 1.4.0 to 1.6.0, Pi reports a failed image conversion as text, without typed image metadata. The extension recognises Pi's `Read image file [image/` prefix, so a text file that starts with exactly that prefix looks the same. This lasts until Pi exposes a way to tell the results apart.
- The extension replaces `read`, and [can't run alongside another replacement](../README.md#other-read-extensions). Revisit native selection support, or public decoration APIs, that could remove the replacement while keeping the source and window behaviour and the display integration. Pi 1.6.0 adds neither.
- In Pi 1.5.0 to 1.6.0, tool render contexts supply `keyHint`, and the renderer uses it for its expansion hint instead of the imported function.
- Pi 1.4.0 to 1.6.0 export `formatReadLineRange`, but it formats `:start-end` suffixes, not the clamped "lines" and "from line" labels of the [renderer](../src/render.ts), so the renderer keeps its own window label.
