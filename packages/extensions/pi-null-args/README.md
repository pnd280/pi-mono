# pi-null-args

Models send an omitted optional tool argument as the text `"null"`, and Pi then rejects the whole call:

```text
Validation failed for tool "subagent":
  - thinking: must be equal to one of the allowed values
```

pi-null-args removes those arguments before Pi validates the call, so the tool uses its default value.

## Behaviour

The extension checks each tool call in each finished assistant message, for every tool: built-in, extension, and MCP tools.

- It removes a top-level argument only when the value is exactly the text `"null"` and the tool's schema does not list the argument as required.
- Required arguments keep the text `"null"`. For example, a search for the pattern `"null"` still works.
- Nested values, other values, and calls to unknown tools stay unchanged.

Pi already removes a real JSON `null` from optional arguments, so the extension handles only the text form.

## Side effects

- The saved session records the cleaned tool call, not the arguments the model sent.
- An optional argument that should really be the text `"null"` is removed too. No current tool needs one.
- The extension writes no files and makes no requests.
