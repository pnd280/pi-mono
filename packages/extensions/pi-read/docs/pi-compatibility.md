# Pi compatibility for maintainers

[pi-read](../README.md)

> Last verified against Pi 1.0.0 (package checks and native-read tests with a real typed tool context, the display adapter, and the installed-CLI suite; runtime delegation unchanged). Not covered: manual image and appearance checks, and schema checks with live providers.

## Upgrade procedure

1. Run the [package and appearance checks](../README.md#validation).
2. When tool schemas, shared arguments and results, or renderer integration change, also check `pi-tool-display`, including its installed-CLI test.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Selection previews must preserve native file access, results, and rendering fallbacks.

### Native delegation

[Native delegation](../src/tool.ts):

- [ ] The supplied tool definition owns the extended native schema and preserved prompt metadata, and the complete `ExtensionToolContext` still matches.
- [ ] Execution arguments, cancellation, images, and the original content and details pass through. Files are never reread.

### Schema

[Schema compatibility](testing.md#registration-and-schema):

- [ ] Serialised parameters leave out runtime metadata and unsupported integer bounds.
- [ ] Execution still validates positive safe integers before file access.

### Results

[Shared result interpretation](result.md):

- [ ] The read window and the code-point selection stay independent, and the preview stays bounded.
- [ ] Truncation and continuation notices are excluded from the source.
- [ ] Preview provenance, invalidity reporting, and borrowed source recovery still satisfy the shared contract.
- [ ] Aggregate and per-block source coordinates preserve native block joins and diagnostic separation.

### Rendering

- [ ] [Rendering](../src/render.ts) and the [display adapter](../../pi-tool-display/src/adapters/pi-read/README.md) keep context and highlight selections without repeating the preview.

## Limitations

- **Image failures.** Pi reports a failed image conversion as text, without typed image metadata. The extension recognises Pi's `Read image file [image/` prefix, so a text file that starts with exactly that prefix looks the same. This lasts until Pi exposes a way to tell the results apart.
- **Replacement.** The extension replaces `read`, and [can't run alongside another replacement](../README.md#compatibility). Revisit native selection support, or public decoration APIs, that could remove the replacement while keeping the source and window behaviour and the display integration.
