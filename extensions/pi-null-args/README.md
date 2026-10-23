# pi-null-args

Models send an omitted optional tool argument as the text `"null"`, and Pi then rejects the whole call:

```text
Validation failed for tool "subagent":
  - thinking: must be equal to one of the allowed values
```

pi-null-args removes those arguments before Pi validates the call, so the tool uses its default value.

## Behaviour

The extension checks each tool call in each finished assistant message. It uses the schemas of known built-in, extension, and MCP tools.

- It removes a top-level argument only when the value is exactly the text `"null"` and the tool's schema does not list the argument as required.
- Required arguments keep the text `"null"`. For example, a search for the pattern `"null"` still works.
- A name listed as required in any `allOf`, `anyOf`, or `oneOf` branch is preserved, even if another branch makes it optional.
- Calls whose schemas use references, conditional or dependent requirements, negations (`not`), fixed values (`const` or `enum`), or minimum property counts (`minProperties`) at the top level or in those branches stay unchanged. These keywords can require an argument that no `required` list names, and the extension does not resolve or evaluate them.
- Nested values, other values, and calls to unknown tools stay unchanged.

Pi removes a real JSON `null` from an optional argument when its property schema rejects `null` and does not use `$ref`. The extension handles only the text form.

## Side effects

- The saved session records the cleaned tool call, not the arguments the model sent.
- An optional argument that should be the text `"null"` is removed too.
- The extension writes no files and makes no requests.
