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

The factory works without the automatic extension or its private Pi hooks. It supplies only `renderShell`, `renderCall`, and `renderResult`. The tool keeps its own execution. Observation, file reads, persistence, and native provenance come from the automatic extension, which also collects output and generates patches. The factory only formats the data that it is given. Grouping and run summaries exist only in the CLI integration and have no public API. Pi handles images and expansion; the terminal checks list the [image platform limitations](validation.md#platform-limitations).

See [tool card presentation](presentation.md) for layout, diff behaviour, and display limits.

## Explicit contracts

Pass a [display adapter](../GLOSSARY.md#interpretation) (`ToolDisplayAdapter`) for specialisation, such as a [native contract](../src/adapters/native/README.md#compatibility-and-selection) for compatible tools, without execution observation:

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

The third argument is `ToolDisplayRendererOptions`, not CLI settings. Its `showParameters` has the effect of the [`showParameters` setting](../README.md#configuration).

## Custom adapters

Import `ToolDisplayAdapter` and its result types from `pi-tool-display/adapters`. The [type declarations](../src/contracts.ts) list the callbacks and fields.

### Callback inputs

Validate borrowed arguments and results without modifying them, and never infer facts from ordinary output. Cards read callbacks once for each update, so callbacks must depend only on their inputs.

### Invocation parts

`alwaysShowParameters: true` overrides `showParameters`. A `kind: "parameters"` part carries the borrowed `value`, not text. The display serialises it as `(…)` only when shown, and `separated: true` puts a space before it. Compact cards shorten the serialised text to the [heading preview budget](#display-budgets).

Use `path` parts, and optionally `range`, only for concrete filesystem targets. Use `value` for literal filters and `pattern` for search patterns. Literal filters receive no filesystem resolution, home expansion, trimming, or case folding, so `src/**` and `./src/**` remain distinct.

Use a `filter` exploration scope for opaque expressions, even when the expression resembles a path. Give the members of a filter group only their patterns, as FFF does with its patterns or `files`. Do not repeat the group's filter or add an `in <path>` phrase to their parts. Standalone and expanded cards keep the literal filter.

### Invalid and partial input

`supports(args, result)` must reject input that the adapter cannot interpret. The automatic CLI integration then shows a generic card with the tool name and parameters, even with `showParameters: false`. For example, invalid todo input becomes `Call failed todo({})`, not `Call failed …`. A rejection applies to one update, and the next update checks `supports` again.

The CLI checks `supports` only after a result exists, including partial updates. Earlier callbacks must tolerate partial arguments, and `exploration` must reject arguments that it cannot parse. Standalone renderers never check `supports`, so standalone adapters must handle incompatible input themselves.

Standalone cards, and automatic rows that have no matching transcript call, receive Pi's raw arguments from `renderCall`. These can contain optional `null` values that Pi removed before execution, so an adapter for these cards must accept or ignore such values. Rows that have a transcript call receive [validated arguments](adapters.md#callback-arguments) when validation succeeds. To add automatic selection for another extension, [register a resolver](adapters.md#add-an-adapter).

Standalone cards do not invoke `exploration`, `action`, or internal `summaryItems`, or read `groupTitle` and `summaryCategories`. Failures in those unused fields therefore cannot cause [generic fallback](../GLOSSARY.md#interpretation) in standalone cards. The card's `summary` callback still applies to standalone results; it is distinct from run-summary items.

### Callback failures

If a callback that a card uses throws, the whole card becomes generic. A card never shows a specialised MCP identity with a generic outcome. After any failure in metadata (`mcp` or `outcome`) or presentation, the heading and the result body both stay generic through later updates and invalidation. The CLI also reads the grouping and run-summary fields, and a failure in one of them makes the whole call generic.

### Exploration scopes

`exploration` supplies ordered items for CLI grouping. It can run before a result exists, so handle partial arguments. File scopes group by normalised parent directory; directory scopes resolve lexically against the session cwd; filter scopes compare opaque expressions exactly.

Items must resolve to one directory or identical filters; files can group with their parent directory. Missing, invalid, or mismatched scopes leave the call standalone, as does returning `undefined` or `[]`. Never derive scopes from summaries or treat arbitrary filters as directories.

For non-file groups such as `pi-todo`, return one stable literal `filter` and set [`groupTitle`](../src/contracts.ts). The title replaces the scope heading; member summaries and notices stay visible. Adjacent calls group only when both the normalised scope and title match, so titled and untitled groups never merge.

See [exploration groups](presentation.md#groups) for headings, boundaries, and expansion behaviour.

### Action wording

Use `Listing <target>` while pending and `Listed <target>` after success, in standalone, grouped, and expanded cards, including an empty-pattern `fffind`. Never add `files in`. Separate a search pattern from its scope with a spaced em dash (U+2014), not `in`:

```ts
{ kind: "annotation", text: " \u2014 " }
```

`headingVerbs(args)` returns, for example, `{ action: "Check", pending: "Checking", complete: "Checked" }`. Omitting the callback or returning `undefined` uses family defaults. Failure, cancellation, and unavailable headings append the outcome to `action`, as in `Check failed`. Verbs and `groupTitle` are plain single-line labels. The display removes terminal controls and turns line breaks and tabs into spaces before wrapping.

### Code and nested calls

`code(args)` returns `{ text, language }` for a source argument, such as a script. The heading renders it below the title with that language's highlighting. Compact cards show up to 10 rows, or all 11 when only one row would be omitted, within the [heading formatting limit](presentation.md#resource-limits), with an expansion hint for omitted source. Handle partial arguments. Return no matching `invocation` parts so the source does not appear twice.

`nestedCalls(result)` lists calls a tool made on the model's behalf, from validated result metadata. It also runs for partial results, so the list updates while the tool runs. Calls precede ordinary output, including on compact read cards that hide successful text. When a card has a usable patch, nested calls and images follow the complete [diff panel](presentation.md#diff-viewer), including its failure output and notices. Compact cards show the latest 8 calls on one row each. Expansion shows every call with its error preview. Multiple calls with a positive `cost` add a model-call total. Names, arguments, and errors are plain text.

### Result summaries

`summary` runs only for completed results with a known success, failure, or cancellation. Use validated metadata or recorded facts. Its `durationMs` is Pi's measured `execute()` time for the final result, or `undefined` when Pi recorded none. Distinguish collected matches from total matches, and failed operations from unfinished ones. Return `undefined` when the data is insufficient.

Summaries precede output. Nonempty compact summaries replace successful text unless `preserveOutput: true`, as for shell status. Failure and cancellation output, notices, and images remain; expansion restores retained text.

Failed and cancelled results show their summary in the outcome colour. Set `neutral: true` when the summary states no outcome, such as codemode's elapsed time, so it stays `dim`.

Missing summaries, including those that display as blank after terminal-control sanitisation, use bounded output previews, including in groups. Successful file reads still hide their text until expansion. Edit and write cards keep their diff previews.

Use `notices` for diagnostics and references that must remain visible when a summary replaces output. [Notices and colours](presentation.md#notices-and-colours) shows how each severity is styled.

### Result patches

Set `patch: true` only when a successful result's `details.patch` contains a unified patch for one file. Headerless hunks are accepted. When file headers are present, the `--- ` and `+++ ` lines must be adjacent, in that order.

Patches use the [retention limit](presentation.md#resource-limits). Invalid or oversized patches follow the [unavailable-patch rules](presentation.md#unavailable-patches).

### Result text

`textParts` interprets a known text envelope. Use result identity and content index to distinguish generated blocks from similar source headings; do not infer provenance from phrases alone. For expanded read cards, an `output` part can supply ordered, nonoverlapping `selection` ranges using zero-based lines and UTF-16 offsets.

Compute ranges from unsanitised text. The renderer uses [selection-aware code highlighting](../../../libs/src/tui/components/code-highlight/README.md) with `searchMatchBg`. Omit ranges for partial or failed results, including cancellations.

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

## Display budgets

Patch generation runs off the UI thread under [shared worker limits](../../../libs/src/bounded-diff/README.md#behaviour). Unchanged redraws reuse decorated assistant prose, run summaries, and heading layout. The pending pulse changes only the heading marker. Running progress timers also refresh elapsed time.

Parameters and generic arguments use the [validated copy of Pi's raw arguments](adapters.md#callback-arguments) when validation against the current tool schema succeeds. Otherwise, they use Pi's raw arguments. This applies to both compact previews and expanded parameters.

Current budgets live in the source:

| Budget             | Source                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Parameter previews | [invocation.ts](../src/invocation.ts)                                                                                              |
| Heading previews   | [headings.ts](../src/rendering/headings.ts)                                                                                        |
| Target layout      | [target-layout.ts](../src/rendering/target-layout.ts)                                                                              |
| Preview formatting | [format.ts](../src/rendering/format.ts)                                                                                            |
| Shell observation  | [observation/](../src/observation/)                                                                                                |
| Saved previews     | [observation/saved-output.ts](../src/observation/saved-output.ts), [transcript/saved-output.ts](../src/transcript/saved-output.ts) |
| Patch limits       | [diff.ts](../src/diff.ts)                                                                                                          |
| Record validation  | [metadata.ts](../src/transcript/metadata.ts)                                                                                       |

The user-visible effects of these budgets are under [resource limits](presentation.md#resource-limits).
