# Adapter development

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

Follow the [tool-card display conventions](conventions.md) for headings, scopes, and invalid-input fallback. Use a resolver to select an adapter automatically for tools with verified provenance. [Standalone adapter integration](renderers.md#custom-adapters) attaches an adapter directly to a tool's renderer fields without a resolver.

## Add an adapter

1. Create `src/adapters/<extension-package>/index.ts` using the registering extension's full package name, including its scope. For example, use `src/adapters/@ff-labs/pi-fff/index.ts`.
2. Export a [`ToolDisplayAdapterResolver`](../src/contracts.ts). Validate the registered tool's provenance and the required parameter schema before returning an adapter. Tool names alone do not establish provenance. Return `undefined` for unsupported definitions.
3. Keep [Zod argument and result schemas](../../../../docs/development.md#runtime-validation), presentation, and tests in that directory. Implement `supports(args, result)` to reject arguments and result shapes the adapter cannot interpret in the automatic CLI integration. Before a result exists, make `exploration` reject unparseable partial arguments itself.
4. Document compatibility, contracts, display behavior, limitations, and extension-specific validation in the adapter's `README.md`.
5. Add the resolver to `extensionAdapterResolvers` in [`src/host/selection.ts`](../src/host/selection.ts), following the [selection order](#automatic-selection).

To expose an adapter factory to tool authors, export it from [`src/adapters/index.ts`](../src/adapters/index.ts).

Adapters must not enable or execute tools, access files, or persist data. Arguments and results are borrowed. Do not mutate them or change model context. Native observation and unavailable-history notices require separate [host provenance checks](../README.md#observation-and-saved-history).

## Automatic selection

The host selects rendering in this order:

1. Invalid settings or `original`: preserve the original renderer.
2. `generic`: force generic rendering.
3. Verified native provenance: select the native contract.
4. Extension resolvers: use the first match, even if the verified extension supplies custom renderers.
5. Unmatched tools: preserve any supplied renderer slots; otherwise use generic rendering.

The resolver list and `selectAdapter` are internal to the host. There is no public resolver registration API. When tools register after history reconstruction, their generic rows switch to the newly available adapters.

## Built-in adapters

- [Pi-native tools](../src/adapters/native/README.md): `nativeAdapter(name)`.
- [@ff-labs/pi-fff](../src/adapters/@ff-labs/pi-fff/README.md): `piFffAdapter(toolInfo)`.
- [pi-mcp-adapter](../src/adapters/pi-mcp-adapter/README.md): `piMcpAdapter(toolInfo)`.
- [pi-todo](../src/adapters/pi-todo/README.md): `piTodoAdapter(toolInfo)`.
