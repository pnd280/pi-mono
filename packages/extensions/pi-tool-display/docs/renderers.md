# Renderer integration

[pi-tool-display](../README.md) · [Adapter development](adapters.md)

Tool authors and SDK hosts can attach the public renderers to a tool definition:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name)
});
```

The factory uses generic rendering by default, even for names such as `read`, `bash`, or `server.search`. Opt into specialized rendering with an [explicit contract](#explicit-contracts).

The factory changes only renderer fields. It does not execute or observe tools, read files, persist metadata, or establish native provenance. Grouping requires the automatic CLI integration and has no public API. Pi handles [image rendering](validation.md#platform-limitations) and the configured expansion action.

See [tool card presentation](presentation.md) for layout, diff behavior, and display limits.

## Explicit contracts

Pass a `ToolDisplayAdapter` to select specialized rendering. For compatible tools, use a [native contract](../src/adapters/native/README.md#compatibility-and-selection) from `pi-tool-display/adapters` without enabling execution observation:

```ts
import { nativeAdapter } from "pi-tool-display/adapters";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...compatibleEdit,
  ...createToolDisplayRenderers(compatibleEdit.name, nativeAdapter("edit"), {
    showParameters: true
  })
});
```

The factory takes a `ToolDisplayRendererOptions` object as its third argument and does not read CLI settings. `showParameters` defaults to `false`. When it is `true`, adapters in the `invocation` family include arguments in their invocation text.

Generic cards always show arguments. Structured parameter blocks still require expansion.

## Custom adapters

Import `ToolDisplayAdapter` and its result types from `pi-tool-display/adapters`. The [type declarations](../src/contracts.ts) document required fields, callback defaults, and restrictions on input mutation.

| Task                                                                                                   | Adapter members                                    |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Customize action wording and argument summaries                                                        | [`headingVerbs`](#action-wording), `invocation`    |
| Validate retained arguments and results                                                                | `supports`                                         |
| Join CLI exploration groups                                                                            | [`exploration`](#exploration-scopes)               |
| Group non-exploration calls under one literal scope                                                    | [`exploration`](#exploration-scopes), `groupTitle` |
| Summarize results in compact and expanded cards                                                        | [`summary`](#result-summaries)                     |
| Report an outcome from structured result metadata                                                      | [`outcome`](#outcomes)                             |
| Present diagnostics and interpret a known text envelope                                                | `notices`, [`textParts`](#result-text)             |
| Avoid a duplicate image fallback label after a known caption                                           | `imageCaptionMimeType`                             |
| Enable unified `details.patch` rendering within the [retention limit](presentation.md#resource-limits) | `patch`                                            |
| Enable CLI preview loading from `details.fullOutputPath`                                               | `savedOutput`                                      |
| Supply typed MCP content                                                                               | [`mcp`](#mcp-facts)                                |

`patch` and `savedOutput` are boolean flags. `groupTitle` is a string. The other members in the table are callbacks. Callbacks receive borrowed arguments and results. Validate unknown input without changing retained data or inferring facts from ordinary output.

When `showParameters` is `false`, the renderer skips invocation parts whose `kind` is `parameters` without reading their `text`, even after expansion. Use a `text` getter to avoid serializing hidden parameters.

For an invocation containing only a concrete target, return a `path` part optionally followed by a `range` part such as `:15-16`. The renderer [wraps the path](presentation.md#card-layout) and keeps the range together when it fits the available width. Use `value` or `pattern` for literal expressions, which receive no path normalization.

Standalone adapters must handle incompatible input themselves. Only the automatic CLI integration checks `supports`. To add automatic selection for another extension, [register a resolver](adapters.md#add-an-adapter).

### Exploration scopes

`exploration(args, result?)` supplies ordered `ExplorationItem` values for CLI grouping. It can run before a result exists, so handle partial arguments. Supply each item's `scope` as `{ kind, value }`:

- `file`: a concrete file target, grouped by its normalized parent directory.
- `directory`: a concrete directory, resolved lexically against the session working directory.
- `filter`: an opaque expression, compared exactly without path resolution, trimming, or case folding.

All items must resolve to the same directory or identical filters. A `file` scope and a `directory` scope can therefore group when the file's parent matches the directory. Missing, invalid, or mismatched scopes keep the call standalone, as do `undefined` and empty exploration results. Do not derive scopes from formatted summaries or interpret arbitrary filters as directories.

Tool adapters that group calls outside file exploration return one `filter` scope with a stable literal and set [`groupTitle`](../src/contracts.ts). The collapsed heading then reads `<groupTitle>` instead of naming a scope. Summaries and notices remain visible beneath each member, just as in standalone cards. `pi-todo` groups its calls this way.

Group headings omit call and operation counts. Each call remains a separate member, including repeated reads. See [exploration groups](presentation.md#groups) for boundaries and expansion behavior.

### Action wording

`headingVerbs(args)` returns an object such as `{ action: "Check", pending: "Checking", complete: "Checked" }`. Omitting the callback or returning `undefined` uses family defaults. Failure, cancellation, and unavailable headings append the outcome to `action`, as in `Check failed`.

### Result summaries

`summary(result, context)` returns a `ResultSummary` with `text` and an optional `preserveOutput` boolean. The context contains `args`, the resolved `outcome`, and recorded `operation` facts when available. The renderer calls it only for completed results whose outcome is `success`, `failure`, or `cancelled`.

Derive summaries from validated metadata or recorded operation facts. Label totals precisely, distinguishing collected matches from total matches and failed operations from unfinished ones. Return `undefined` when the data cannot support a summary.

Summaries appear before output in compact and expanded cards. In compact cards, a nonempty summary replaces successful text output by default. Set `preserveOutput: true` for summaries that supplement output, such as a shell exit status. Failure and cancellation output, notices, and images remain visible. Expansion restores retained text.

Missing, empty, or whitespace-only summaries use bounded output previews, including in groups. Successful file reads still hide their text until expansion. Edit and write cards keep their diff previews.

Use `notices` for diagnostics and references that must remain visible when a summary replaces output. Notice severity controls styling, not visibility. Compact groups retain `info` notices.

### Result text

`textParts(text, args, context)` interprets a known text envelope. Its context includes `isError` (`true` for failure or cancellation), `isCancelled`, `isPartial`, `expanded`, and `hasImages`.

Suppress a known cancellation message only when `isCancelled` is true. Retain useful diagnostics and restore the full diagnostic on expansion.

### Outcomes

`outcome(result)` may return `success`, `failure`, `cancelled`, `unavailable`, or `undefined`. The renderer uses this value and MCP outcomes only for completed results. Omitting the callback or returning `undefined` leaves Pi's outcome and any MCP facts unchanged.

Cancellation takes precedence over failure. Successful or unavailable metadata cannot override either. Pi's error flag counts as failure.

The factory does not observe execution cancellation. A standalone adapter must supply structured cancellation evidence to display a cancelled outcome.

### MCP facts

`ToolDisplayAdapter.mcp(args, result?)` returns `McpFacts`, or `undefined` when typed facts are unavailable. Facts contain `server`, `tool`, `outcome`, and ordered content blocks. The outcome is `transport-error`, `returned-error`, `cancelled`, `success`, or `unavailable`:

```ts
import type { McpFacts } from "pi-tool-display/adapters";

const facts: McpFacts = {
  server: "documentation",
  tool: "search",
  outcome: "success",
  content: [
    { type: "text", text: "Found one reference." },
    { type: "media", mimeType: "image/png", contentIndex: 1 },
    { type: "resource", uri: "file:///reference", text: "Retained resource text" }
  ]
};
```

Media entries reference Pi result blocks. Do not copy base64 into display facts. Text, media, and resource notices retain their order, while Pi renders inline images.

Text and embedded resource bodies use the resolved outcome's color: `error` for failures, `warning` for cancellations, and `toolOutput` otherwise. Resource labels use `dim`, and URIs use normal foreground.

Generic rendering never infers missing transport or type information from names or error text. Arbitrary `details` are not displayed.
