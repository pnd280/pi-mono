# Adapter development

Adapters translate a verified tool contract into the shared display model. The public entry point is `pi-tool-display/adapters`; the [renderer API](renderers.md#explicit-contracts) describes its callbacks.

## Adding an adapter

Create `src/adapters/<provider>/index.ts` with a `ToolDisplayAdapterResolver`: `(tool: ToolInfo | undefined) => ToolDisplayAdapter | undefined`. Validate registered ownership and the required parameter schema before returning an adapter. Tool names alone do not establish ownership. Return `undefined` for unsupported definitions.

Keep argument/result validation, presentation, and tests in that directory. Shared renderers consume callbacks rather than recognizing provider names or result envelopes. If coordinated rendering depends on a result shape, implement [`supports(args, result)`](renderers.md#explicit-contracts). Before a result exists, `exploration` must handle partial arguments itself.

Native execution observation and unavailable-history notices remain separate because they require verified Pi factory provenance. Adapters receive retained arguments/results only: they do not enable tools, execute operations, inspect current files, or persist data.

## Automatic selection

Add the resolver to `extensionAdapterResolvers` in [`src/adapters/registry.ts`](../src/adapters/registry.ts). Selection applies, in order:

1. Invalid settings or `original`: preserve the original renderer.
2. `generic`: force generic rendering.
3. Verified native ownership: select the native contract.
4. Extension resolvers: use the first match, including when the verified owner supplies renderer slots.
5. Unmatched tools: preserve either owner renderer slot; otherwise use generic rendering.

A resolver entry explicitly opts its verified owner into automatic display replacement. This list is local source configuration, not a runtime registration API. Explicit SDK/tool-owner adapters can instead be passed directly to `createToolDisplayRenderers` without joining the list.

Historical generic rows adopt newly available contracts when tools register after reconstruction. Export an owner-facing factory from [`src/adapters/index.ts`](../src/adapters/index.ts) when it should be part of the public adapter API.
