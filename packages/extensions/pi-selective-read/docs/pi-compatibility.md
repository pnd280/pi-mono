# Pi compatibility

[pi-selective-read](../README.md)

## Contracts to verify

- [ ] [Native delegation](../src/tool.ts): factory/schema, prompt metadata, the complete `ExtensionToolContext`, execution arguments, cancellation, images, and original content/details; never reread files.
- [ ] [Schema compatibility](testing.md#contracts): serialized parameters omit runtime metadata and unsupported integer bounds; execution still validates positive safe integers before file access.
- [ ] [Results](../src/result.ts): independent read window and code-point selection, bounded preview, truncation/continuation notices excluded from source, and preview provenance accepted only for the exact all-text result shape with one trailing preview block.
- [ ] [Rendering](../src/render.ts) and the [display adapter](../../pi-tool-display/src/adapters/pi-selective-read/README.md): preserve context and highlight selections without duplicating previews.

## Limitations and replacement opportunities

- Pi reports a failed image conversion as text without typed image metadata. This extension recognizes the native `Read image file [image/` prefix, so a text file starting with that exact prefix is indistinguishable until Pi exposes a result discriminant.
- This extension replaces `read` and [cannot coexist with another replacement](../README.md#compatibility). Revisit native selection support or public decoration APIs that could remove the replacement while preserving source/window semantics and display integration.

## Validation

Pi **0.99.1** package checks and native-read tests passed with a real typed tool context; the runtime delegation is unchanged. The display adapter and installed-CLI suite also passed. Manual image/appearance and live-provider schema checks were not run.

Use [package and appearance checks](../README.md#validation); also check `pi-tool-display`, including its installed-CLI test, when changing tool schemas, shared arguments/results, or renderer integration.
