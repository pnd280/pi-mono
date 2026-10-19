# Tool-card display conventions

[pi-tool-display](../README.md) · [Adapter development](adapters.md)

Extension authors must use consistent action wording and invalid-input fallback in [display adapters](../GLOSSARY.md#interpretation). The [`ToolDisplayAdapter` type](../src/contracts.ts) defines the available fields.

For layout and host-drawn group headings, use [presentation](presentation.md#headings-and-members). For callback contracts, use [custom adapters](renderers.md#custom-adapters).

## Action headings

Use `Listing <target>` while pending and `Listed <target>` after success across standalone, grouped, and expanded cards, including empty-pattern `fffind`. Never add `files in`.

Separate search patterns and scopes with a spaced em dash (U+2014), not `in`. Use the `\u2014` escape in TypeScript source because the repository's pre-commit hook rejects literal em dashes:

```ts
{ kind: "annotation", text: " \u2014 " }
```

## Literal filters and paths

Use `path` invocation parts only for concrete filesystem targets. Use `value` for literal filters and `pattern` for search patterns. Literal filters receive no filesystem resolution, home expansion, trimming, or case folding; `src/**` and `./src/**` remain distinct.

Use a `filter` exploration scope for opaque expressions, even when the expression resembles a path. Collapsed FFF members show only their patterns or `files`; do not repeat the group's filter or add an `in <path>` phrase. Standalone and expanded cards retain the literal filter.

## Invalid-input fallback

`supports(args, result)` must reject uninterpretable input. Automatic CLI fallback shows generic tool names and parameters even with `showParameters: false`: invalid todo input becomes `Call failed todo({})`, not `Call failed …`.

The CLI checks `supports` only after a result exists, including partial updates. Earlier callbacks must tolerate partial arguments; `exploration` must reject unparseable ones. Standalone renderers never check `supports`; adapters handle incompatibility.
