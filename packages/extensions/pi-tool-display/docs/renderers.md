# Renderer integration

[pi-tool-display](../README.md) · [Adapter development](adapters.md)

For tool authors who want pi-tool-display cards for their own tools, spread the public renderers into a tool definition:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name)
});
```

Rendering defaults to generic, even for `read`, `bash`, or `server.search`; specialisation needs an [explicit contract](#explicit-contracts).

The factory works without the automatic extension or its private Pi hooks. It supplies only renderer fields: no execution, observation, file reads, persistence, or native provenance. Grouping and run summaries exist only in the CLI integration and have no public API. Pi handles [images](validation.md#platform-limitations) and expansion.

See [tool card presentation](presentation.md) for layout, diff behaviour, and display limits.

## Explicit contracts

Pass a `ToolDisplayAdapter` for specialisation, such as a [native contract](../src/adapters/native/README.md#compatibility-and-selection) for compatible tools, without execution observation:

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

The exported `subagentDisplayAdapter` and `subagentAbortDisplayAdapter` supply the same task-progress cards used by pi-subagents, including its standalone tool, abort, and completion renderers. See its [contract and display limits](../src/adapters/pi-subagents/README.md).

The third argument is `ToolDisplayRendererOptions`, not CLI settings. `showParameters: true` shows optional specialised parameters. MCP and generic cards always show arguments, and structured blocks need expansion.

## Custom adapters

Import `ToolDisplayAdapter` and its result types from `pi-tool-display/adapters`. Use the [type declarations](../src/contracts.ts) for the callback and field inventory. The sections below cover choices that types alone cannot explain: [grouping](#exploration-scopes), [summaries](#result-summaries), [source text](#result-text), [outcomes](#outcomes), and [MCP facts](#mcp-facts).

Validate borrowed arguments and results without modifying them, and never infer facts from ordinary output. `alwaysShowParameters: true` overrides `showParameters`. Hidden parts with `kind: "parameters"` skip `text` access even after expansion; use a getter to avoid hidden serialization.

For concrete targets use `path` and optionally `range`; use `value` or `pattern` for literal expressions, which receive no path normalization. See [display conventions](conventions.md#literal-filters-and-paths).

Standalone adapters must handle incompatible input themselves. Only the automatic CLI integration checks `supports`. To add automatic selection for another extension, [register a resolver](adapters.md#add-an-adapter).

Standalone cards do not invoke `exploration`, `action`, or internal `summaryItems`, or read `groupTitle` and `summaryCategories`. Failures in those unused fields therefore cannot force standalone fallback. The card's `summary` callback still applies to standalone results; it is distinct from run-summary items.

Callbacks used by cards fail atomically to generic meaning, so specialised MCP identity never survives with generic outcomes. A failure in metadata (`mcp` or `outcome`) applies to the current snapshot and can recover after an update or invalidation. A presentation failure keeps both retained slots generic through later updates. The CLI also interprets grouping and run-summary fields, whose failures invalidate the whole interpretation.

### Exploration scopes

`exploration` supplies ordered items for CLI grouping. It can run before a result exists, so handle partial arguments. File scopes group by normalized parent directory; directory scopes resolve lexically against the session cwd; filter scopes compare opaque expressions exactly.

Items must resolve to one directory or identical filters; files can group with their parent directory. Missing, invalid, or mismatched scopes leave the call standalone, as does returning `undefined` or `[]`. Never derive scopes from summaries or treat arbitrary filters as directories.

For non-file groups such as `pi-todo`, return one stable literal `filter` and set [`groupTitle`](../src/contracts.ts). The title replaces the scope heading; member summaries and notices stay visible. Adjacent calls group only when both the normalized scope and title match, so titled and untitled groups never merge.

See [exploration groups](presentation.md#groups) for headings, boundaries, and expansion behaviour.

### Action wording

`headingVerbs(args)` returns, for example, `{ action: "Check", pending: "Checking", complete: "Checked" }`. Omitting the callback or returning `undefined` uses family defaults. Failure, cancellation, and unavailable headings append the outcome to `action`, as in `Check failed`. Verbs and `groupTitle` are plain single-line labels: terminal controls are removed, and line breaks and tabs become spaces before wrapping.

### Code and nested calls

`code(args)` returns `{ text, language }` for a source argument, such as a script. The heading renders it below the title with that language's highlighting. Compact cards show up to 10 rows within the [heading formatting limit](presentation.md#resource-limits), with an expansion hint for omitted source. Handle partial arguments. Return no matching `invocation` parts so the source does not appear twice.

`nestedCalls(result)` lists calls a tool made on the model's behalf, from validated result metadata. It also runs for partial results, so the list updates while the tool runs. Calls precede the output, including on compact read cards that hide successful text. Compact cards show the latest 8 calls on one row each. Expansion shows every call with its error preview. Multiple calls with a positive `cost` add a model-call total. Names, arguments, and errors are plain text.

### Result summaries

`summary` runs only for completed results with a known success, failure, or cancellation. Use validated metadata or recorded facts. Distinguish collected matches from total matches, and failed operations from unfinished ones. Return `undefined` when the data is insufficient.

Summaries precede output. Nonempty compact summaries replace successful text unless `preserveOutput: true`, as for shell status. Failure and cancellation output, notices, and images remain; expansion restores retained text.

Missing summaries, including those that display as blank after terminal-control sanitization, use bounded output previews, including in groups. Successful file reads still hide their text until expansion. Edit and write cards keep their diff previews.

Use `notices` for diagnostics and references that must remain visible when a summary replaces output. Notice severity controls styling, not visibility. Compact groups retain `info` notices.

### Result text

`textParts` interprets a known text envelope. Use result identity and content index to distinguish generated blocks from similar source headings; do not infer provenance from phrases alone. For expanded read cards, an `output` part can supply ordered, nonoverlapping `selection` ranges using zero-based lines and UTF-16 offsets.

Compute ranges from unsanitized text. The renderer uses [selection-aware code highlighting](../../../libs/src/tui/components/code-highlight/README.md) with `searchMatchBg`. Omit ranges for partial or failed results, including cancellations.

Suppress a known cancellation message only when `isCancelled` is true. Retain useful diagnostics and restore the full diagnostic on expansion.

### Outcomes

`outcome` and MCP outcomes apply only to completed results. Omitting an outcome leaves Pi's outcome and any MCP facts unchanged.

Cancellation takes precedence over failure. Successful or unavailable metadata cannot override either. Pi's error flag counts as failure.

The factory does not observe execution cancellation. A standalone adapter must supply structured cancellation evidence to display a cancelled outcome.

### MCP facts

`mcp` supplies [typed facts](../src/contracts.ts) when available, preserving ordered text, media, and resource blocks. Return `undefined` when types are unavailable.

Media entries retain ordered MIME labels, not result-block indices or copied base64. Preserve the order of text, media, and resource blocks. Pi owns image bytes and renders the images.

Text and embedded resource bodies use the resolved outcome's colour: `error` for failures, `warning` for cancellations, and `toolOutput` otherwise. Resource labels use `dim`, and URIs use normal foreground.

Generic rendering never infers missing transport or type information from names or error text. Arbitrary `details` are not displayed.
