# pi-null-args

Models sometimes send an omitted optional tool argument as the text `"null"`. Pi then rejects the whole call when the argument's schema rejects that text, and otherwise passes the text to the tool. pi-null-args removes those arguments before Pi validates the call, so the tool sees them as omitted. It has no controls and no settings.

Without the extension, Pi shows this error for a call with `"thinking": "null"`:

```text
Validation failed for tool "subagent":
  - thinking: expected one of ["off","minimal","low","medium","high","xhigh","max"]
```

## Usage

The extension checks each tool call in each finished assistant message. It uses the schemas of known built-in, extension, and MCP tools.

- It removes a top-level argument only when the value is exactly the text `"null"` and the tool's schema does not list the argument as required.
- Required arguments keep the text `"null"`. For example, a search for the pattern `"null"` still works.
- A name listed as required in any `allOf` or `anyOf` branch is preserved, even if another branch makes it optional.
- Calls whose schemas use references or dynamic references, exclusive alternatives (`oneOf`), conditional or dependent requirements, negations (`not`), fixed values (`const` or `enum`), or minimum property counts (`minProperties`) at the top level or in those branches stay unchanged. These keywords can require an argument that no `required` list names, and the extension does not resolve or evaluate them.
- Nested values, other values, and calls to unknown tools stay unchanged.

Pi removes a real JSON `null` from an optional argument that the tool schema declares directly in its `properties`, when that property's schema rejects `null` and does not use `$ref`. Pi does not remove it from an argument declared only in `allOf`, `anyOf`, or `oneOf` branches, or matched by pattern or additional properties; for a string argument, the tool then receives the text `"null"`. The extension handles only the text form.

## Side effects

- The saved session records the cleaned tool call, not the arguments the model sent.
- An optional argument that should be the text `"null"` is removed too.
- The extension writes no files and makes no requests.

## Docs

| When you…                   | Read                                         |
| --------------------------- | -------------------------------------------- |
| Decide where a test belongs | [Testing](docs/testing.md)                   |
| Upgrade Pi                  | [Pi compatibility](docs/pi-compatibility.md) |
