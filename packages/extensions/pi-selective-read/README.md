# pi-selective-read

Highlights referenced source spans within Pi's `read` context.

## Usage

Pass the filename in `path`, coordinates in `selection`, and an independent read window in `offset`/`limit`. For `src/example.ts:12:4-15:9`:

```json
{
  "path": "src/example.ts",
  "offset": 8,
  "limit": 20,
  "selection": {
    "startLine": 12,
    "startColumn": 4,
    "endLine": 15,
    "endColumn": 9
  }
}
```

`path` does not parse location suffixes. Lines are absolute and 1-based; columns count 1-based Unicode code points, not bytes or terminal cells.

- `startColumn` defaults to 1.
- `endLine` defaults to `startLine`.
- `endColumn` is exclusive. Omit it to select through the final line's end.

Coordinates must be positive safe integers, and the end must follow the start.

`selection` appends a preview without changing original content: at most five lines and 500 code points per line, with `…` for omissions. Use the original read content for exact edits; the preview may be partial or outside the read window.

Expand a successful text read to highlight the selection in context. Pi's image handling and truncation limits remain.

## Configuration

No options or extension-specific environment variables.

## Side effects

Replaces built-in `read` and adds source-reference prompt guidance. Previews enter tool results and session history. No file writes, network requests, or other persistent state.

## Compatibility

Do not load another `read` replacement alongside this extension.

In automatic mode, the [pi-tool-display selective-read adapter](../pi-tool-display/src/adapters/pi-selective-read/README.md) groups compatible reads and highlights selections without repeating the preview. Set `rendererOverrides.read` to `original` in [pi-tool-display settings](../pi-tool-display/README.md#configuration) for this extension's ungrouped rendering. `generic` neither highlights selections nor hides the appended preview.

## Validation

[Coverage specification](docs/testing.md).

Use the [focused validation commands](../../../docs/development.md#focused-validation) with package name `pi-selective-read`.

For appearance changes, inspect collapsed and expanded reads in Pi with a multiline selection, tabs, wide characters, a narrow terminal, and both light and dark themes. Check that context stays visible and the preview is not duplicated.
