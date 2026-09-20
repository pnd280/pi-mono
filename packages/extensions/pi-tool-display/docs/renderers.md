# Renderer integration

[pi-tool-display](../README.md) · [Adapter development](adapters.md)

Attach public renderers to a tool definition:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name)
});
```

Rendering defaults to generic, even for `read`, `bash`, or `server.search`; specialization needs an [explicit contract](#explicit-contracts). The factory changes only renderer fields: no execution, observation, file reads, persistence, or native provenance. Grouping is CLI-only with no public API. Pi handles [images](validation.md#platform-limitations) and expansion.

See [tool card presentation](presentation.md) for layout, diff behavior, and display limits.

## Explicit contracts

Pass a `ToolDisplayAdapter` for specialization, such as a [native contract](../src/adapters/native/README.md#compatibility-and-selection) for compatible tools, without execution observation:

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

The third argument is `ToolDisplayRendererOptions`, not CLI settings. `showParameters` defaults to `false`; `true` includes arguments in `invocation`-family text. MCP/generic cards always show arguments; structured blocks require expansion.

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

Validate borrowed arguments/results without mutation or inferring facts from ordinary output. `alwaysShowParameters: true` overrides `showParameters`. Parts with `kind: "parameters"` skip `text` access when hidden, even after expansion; use a getter to avoid hidden serialization.

For an invocation containing only a concrete target, return a `path` part optionally followed by a `range` part such as `:15-16`. The renderer [wraps the path](presentation.md#card-layout) and keeps the range together when it fits the available width. Use `value` or `pattern` for literal expressions, which receive no path normalization.

Standalone adapters must handle incompatible input themselves. Only the automatic CLI integration checks `supports`. To add automatic selection for another extension, [register a resolver](adapters.md#add-an-adapter).

### Exploration scopes

`exploration(args, result?)` supplies ordered `ExplorationItem` values for CLI grouping. It can run before a result exists, so handle partial arguments. Supply each item's `scope` as `{ kind, value }`:

- `file`: a concrete file target, grouped by its normalized parent directory.
- `directory`: a concrete directory, resolved lexically against the session working directory.
- `filter`: an opaque expression, compared exactly without path resolution, trimming, or case folding.

Items must resolve to one directory or identical filters; files can group with their parent directory. Missing, invalid, or mismatched scopes and `undefined`/empty results stay standalone. Never derive scopes from summaries or treat arbitrary filters as directories.

For non-file groups such as `pi-todo`, return one stable literal `filter` and set [`groupTitle`](../src/contracts.ts). The title replaces the scope heading; member summaries/notices stay visible.

Group headings omit call and operation counts. Each call remains a separate member, including repeated reads. See [exploration groups](presentation.md#groups) for boundaries and expansion behavior.

### Action wording

`headingVerbs(args)` returns an object such as `{ action: "Check", pending: "Checking", complete: "Checked" }`. Omitting the callback or returning `undefined` uses family defaults. Failure, cancellation, and unavailable headings append the outcome to `action`, as in `Check failed`.

### Result summaries

`summary(result, context)` runs only for completed results whose outcome is `success`, `failure`, or `cancelled`.

Use validated metadata or recorded facts. Distinguish collected/total matches and failed/unfinished operations; return `undefined` without sufficient data.

Summaries precede output. Nonempty compact summaries replace successful text unless `preserveOutput: true`, as for shell status. Failure/cancellation output, notices, and images remain; expansion restores retained text.

Missing, empty, or whitespace-only summaries use bounded output previews, including in groups. Successful file reads still hide their text until expansion. Edit and write cards keep their diff previews.

Use `notices` for diagnostics and references that must remain visible when a summary replaces output. Notice severity controls styling, not visibility. Compact groups retain `info` notices.

### Result text

`textParts(text, args, context)` interprets a known text envelope. Its context includes `isError` (`true` for failure or cancellation), `isCancelled`, `isPartial`, `expanded`, and `hasImages`.

`context.result` and `context.contentIndex` identify the result and its current content block. Distinguish generated blocks from similar source headings through metadata.

For expanded read cards, an `output` part can supply ordered, nonoverlapping `selection` ranges. Each range contains:

- `line`: the zero-based line index within the part's text.
- `start`: the inclusive UTF-16 offset within that line.
- `end`: the exclusive UTF-16 offset within that line.

Compute ranges from unsanitized text. The renderer uses [selection-aware code highlighting](../../../libs/src/tui/components/code-highlight/README.md) with `searchMatchBg`. Omit ranges for partial or failed results, including cancellations.

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

Media reference Pi result blocks, never copied base64. Preserve text/media/resource order; Pi renders images.

Text and embedded resource bodies use the resolved outcome's color: `error` for failures, `warning` for cancellations, and `toolOutput` otherwise. Resource labels use `dim`, and URIs use normal foreground.

Generic rendering never infers missing transport or type information from names or error text. Arbitrary `details` are not displayed.
