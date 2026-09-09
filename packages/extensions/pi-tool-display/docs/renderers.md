# Renderer integration

Spread the display renderers after your custom/MCP tool definition to preserve its execution, schema, and metadata:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name, "invocation")
});
```

In SDK hosts, decorate the host's tool definitions with this factory instead of loading the CLI-only default extension.

Use `"invocation"` to display custom arguments as JSON.

For Pi-compatible tools, select a specialized family. Path arguments accept `path` or `file_path`.

| Family     | Fields used for display                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `"read"`   | Path, optional `offset` and `limit` for the line range. Successful reads collapse to a summary.                                |
| `"search"` | `pattern`, optional path and `glob`.                                                                                           |
| `"list"`   | Path.                                                                                                                          |
| `"shell"`  | `command`, optional `timeout` in seconds.                                                                                      |
| `"edit"`   | Path and result `details.diff` in Pi's numbered format, such as `-11 old` and `+11 new`. Without a diff, displays result text. |
| `"write"`  | Path and `content`; expansion shows the submitted content.                                                                     |

If the family is omitted, `read`, `edit`, and `write` select their matching families; `grep`/`find` select `"search"`, `ls` selects `"list"`, and `bash`/`powershell` select `"shell"`. Other names use `"invocation"`.

## Result metadata

All families require Pi text/image result content blocks. To keep omission notices visible when collapsed, supply Pi-compatible `details` fields:

- `truncation.truncated: true` for truncated output.
- `fullOutputPath` as a string for the saved-output path.
- `matchLimitReached`, `resultLimitReached`, or `entryLimitReached` as numbers for result limits.
- `linesTruncated: true` for shortened lines.

Other than these fields and the edit family's `diff`, `details` is ignored.
