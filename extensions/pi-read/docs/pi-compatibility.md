# Pi compatibility for maintainers

[pi-read](../README.md)

> Last verified against Pi 1.4.0 with the package checks, native-read tests that use a real typed tool context and the display adapter, and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: manual image checks, manual appearance checks, and schema checks with live providers.

## Upgrade procedure

1. Run the [package checks](../README.md#validation) and the [manual appearance checks](testing.md#manual-checks).
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

- In Pi 1.4.0, Pi reports a failed image conversion as text, without typed image metadata. The extension recognises Pi's `Read image file [image/` prefix, so a text file that starts with exactly that prefix looks the same. This lasts until Pi exposes a way to tell the results apart.
- The extension replaces `read`, and [can't run alongside another replacement](../README.md#compatibility). Revisit native selection support, or public decoration APIs, that could remove the replacement while keeping the source and window behaviour and the display integration. Pi 1.4.0 adds neither.
- Pi 1.4.0 exports `formatReadLineRange`, but it formats `:start-end` suffixes, not the clamped "lines" and "from line" labels of the [renderer](../src/render.ts), so the renderer keeps its own window label.
