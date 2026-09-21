# Pi compatibility

[pi-selective-read](../README.md)

## Contracts to verify

- [ ] [Native delegation](../src/tool.ts): factory/schema, prompt metadata, execution arguments, cancellation, images, and original content/details; never reread files.
- [ ] [Results](../src/result.ts): independent read window and code-point selection, bounded preview, truncation/continuation notices excluded from source.
- [ ] [Rendering](../src/render.ts) and the [display adapter](../../pi-tool-display/src/adapters/pi-selective-read/README.md): preserve context and highlight selections without duplicating previews.

## Limitations and replacement opportunities

- This extension replaces `read` and [cannot coexist with another replacement](../README.md#compatibility). Revisit native selection support or public decoration APIs that could remove the replacement while preserving source/window semantics and display integration.

## Validation

Use [package and appearance checks](../README.md#validation); also check `pi-tool-display` when changing shared arguments/results or renderer integration.
