# Tool-card display conventions

[pi-tool-display](../README.md) · [Adapter development](adapters.md)

Use these conventions when implementing a [`ToolDisplayAdapter`](../src/contracts.ts). For layout, see [tool card presentation](presentation.md). For callback contracts, see [custom adapters](renderers.md#custom-adapters).

## Invalid-input fallback

Implement `supports(args, result)` to reject arguments and result shapes the adapter cannot interpret. In the automatic CLI integration, unsupported calls use generic cards with the tool name and parameters visible, even when `showParameters` is false. For example, invalid todo arguments render as `Call failed todo({})` rather than an unnamed `Call failed …`.

The CLI checks `supports` only once a result exists, including partial updates. Before then, callbacks must tolerate partial arguments, and `exploration` must reject unparseable arguments itself. Standalone renderers do not check `supports`; their adapters must handle incompatible input directly.

## Action headings

A completed listing reads `Listed <target>`, including an empty-pattern `fffind` listing. Do not add `files in` to that heading. Preserve pending and completed tense: `Listing` and `Listed`, not a bare `List` while running.

Separate search patterns and scopes with a spaced em dash (U+2014), not `in`. Use the `\u2014` escape in TypeScript source because the repository's pre-commit hook rejects literal em dashes:

```ts
{ kind: "annotation", text: " \u2014 " }
```

## Group headings

Use `Exploring <path>` and `Explored <path>` for directory groups, and `Filtering <filter>` and `Filtered <filter>` for literal-filter groups. Keep `ExplorationScope` kind names such as `directory` and `filter` out of displayed headings. Adapter-defined groups may use a custom title such as `Todo`.

Do not add call or operation counts to group headings. Member rows already show those calls. Preserve failure, cancellation, and unavailable-outcome badges and the diagnostics beneath each affected member.

## Literal filters and paths

Use `path` invocation parts only for concrete filesystem targets. Use `value` for literal filters and `pattern` for search patterns. Literal filters receive no filesystem resolution, home expansion, trimming, or case folding; `src/**` and `./src/**` remain distinct.

Use a `filter` exploration scope for opaque expressions, even when the expression resembles a path. Collapsed FFF members show only their patterns or `files`; do not repeat the group's filter or add an `in <path>` phrase. Standalone and expanded cards retain the literal filter.
