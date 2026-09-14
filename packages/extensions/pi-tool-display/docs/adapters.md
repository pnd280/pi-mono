# Adapter development

Adapters translate a verified tool contract into the shared display model. The public entry point is `pi-tool-display/adapters`; the [renderer API](renderers.md#explicit-contracts) describes its callbacks.

## Adding an adapter

Create `src/adapters/<extension-package>/index.ts`, using the owning extension's package name as the directory path, including its scope (for example, `src/adapters/@ff-labs/pi-fff/`). Export a `ToolDisplayAdapterResolver`: `(tool: ToolInfo | undefined) => ToolDisplayAdapter | undefined`. Validate registered ownership and the required parameter schema before returning an adapter. Tool names alone do not establish ownership. Return `undefined` for unsupported definitions.

Keep argument/result validation, presentation, tests, and extension-specific documentation in that directory. Document compatibility, contracts, display behavior, limitations, and extension-specific validation in its `README.md`. Shared renderers consume callbacks rather than recognizing extension names or result envelopes. If coordinated rendering depends on a result shape, implement [`supports(args, result)`](renderers.md#explicit-contracts). Before a result exists, `exploration` must handle partial arguments itself.

Native execution observation and unavailable-history notices remain separate because they require verified Pi factory provenance. Adapters receive retained arguments/results only: they do not enable tools, execute operations, inspect current files, change retained results or model context, or persist data.

## Automatic selection

Add the resolver to `extensionAdapterResolvers` in [`src/host/selection.ts`](../src/host/selection.ts). Selection applies, in order:

1. Invalid settings or `original`: preserve the original renderer.
2. `generic`: force generic rendering.
3. Verified native ownership: select the native contract.
4. Extension resolvers: use the first match, including when the verified owner supplies renderer slots.
5. Unmatched tools: preserve either owner renderer slot; otherwise use generic rendering.

A resolver entry explicitly opts its verified owner into automatic display replacement. The resolver list and `selectAdapter` are internal host policy, not exports of `pi-tool-display/adapters` or a runtime registration API. Explicit SDK/tool-owner adapters can instead be passed directly to `createToolDisplayRenderers` without joining the list.

Historical generic rows adopt newly available contracts when tools register after reconstruction. Export an owner-facing factory from [`src/adapters/index.ts`](../src/adapters/index.ts) when it should be part of the public adapter API.

## Built-in adapters

- [Pi-native tools](../src/adapters/native/README.md): `nativeAdapter(name)`.
- [@ff-labs/pi-fff](../src/adapters/@ff-labs/pi-fff/README.md): `piFffAdapter(toolInfo)`.
- [pi-mcp-adapter](../src/adapters/pi-mcp-adapter/README.md): `piMcpAdapter(toolInfo)`.
