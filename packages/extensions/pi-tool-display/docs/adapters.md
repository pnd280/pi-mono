# Adapter development

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

Follow [display conventions](conventions.md). Resolvers automatically select verified tools; [standalone integration](renderers.md#custom-adapters) attaches adapters directly to renderer fields.

## Add an adapter

1. Create `src/adapters/<extension-package>/index.ts` using the registering extension's full package name, including its scope. For example, use `src/adapters/@ff-labs/pi-fff/index.ts`.
2. Export a [`ToolDisplayAdapterResolver`](../src/contracts.ts); verify provenance and the [required structural contract](#recognize-tool-contracts), not names alone. Return `undefined` for unsupported definitions.
3. Colocate [Zod schemas](../../../../docs/development.md#runtime-validation), presentation, and tests. Use `supports(args, result)` to reject uninterpretable CLI input; before results exist, `exploration` must reject unparseable partial arguments.
4. Document compatibility, contracts, display behavior, limitations, and extension-specific validation in the adapter's `README.md`.
5. Add the resolver to `extensionAdapterResolvers` in [`src/host/selection.ts`](../src/host/selection.ts), following the [selection order](#automatic-selection).

To expose an adapter factory to tool authors, export it from [`src/adapters/index.ts`](../src/adapters/index.ts).

Callbacks should return `undefined` or reject through `supports` rather than throw. Interpretation resolves metadata together so a throwing callback cannot mix specialized identities with generic outcomes. A presentation failure keeps that call generic across later updates; it leaves exploration groups and uses generic summary counts, while preserving `omitFromSummary`. The host warns once per adapter ID.

Adapters must not enable/execute tools, access files, persist data, mutate borrowed arguments/results, or change model context. Native observation and unavailable-history notices need separate [host provenance checks](../README.md#observation-and-saved-history).

## Recognize tool contracts

Match verified provenance and the parameter structure the renderer needs: types, required fields, and object strictness where relevant. Do not fingerprint complete schemas or require numeric bounds, descriptions, or other details that provider-facing projection can omit or rewrite. Removing `minimum` from an integer coordinate, for example, must not disable its display adapter. Validate argument values and result shapes separately before specialized rendering.

Build schema fixtures through the registered tool's projection, and retain integration coverage that loads the extension. Projection changes also affect schema-inspecting consumers: run their adapter and installed-CLI checks, not just the producing tool's tests.

## Summary items

[Summary mode](presentation.md#summary-mode) uses internal adapter fields. They are not part of the [renderer API](renderers.md) yet and may change without notice.

- `omitFromSummary: true` excludes the owner's calls even when incompatible arguments/results require generic cards, as for todo bookkeeping. This static policy never interprets unsupported result facts.
- `summaryItems(args, { result, change, cwd })` returns a supported call's summary items. Each names a `category` and optional `identity`, such as a lexically resolved file or directory path. Identities deduplicate within a category by latest outcome; items without one count every call. Return `[]` to omit the call or `undefined` to count it once in its family's category (`write` by change fact, `invocation` by tool name). Generic fallback ignores this callback and adapter result facts.
- `summaryCategories` declares new categories with `count` wording for one and several items (both use `{n}`). A leading word before the first placeholder renders as the verb. Built-in categories cannot be redefined.

Built-in categories are listed under [summary counting](presentation.md#counting).

## Automatic selection

The host selects rendering in this order:

1. Invalid settings or `original`: preserve the original renderer.
2. `generic`: force generic rendering.
3. Verified native provenance: select the native contract.
4. Extension resolvers: use the first match, even if the verified extension supplies custom renderers.
5. Unmatched tools: preserve any supplied renderer slots; otherwise use generic rendering.

The resolver list and `selectAdapter` are host-internal; no public registration API exists. Late tool registration switches reconstructed generic rows to available adapters.

## Built-in adapters

- [Pi-native tools](../src/adapters/native/README.md): `nativeAdapter(name)`.
- [@ff-labs/pi-fff](../src/adapters/@ff-labs/pi-fff/README.md): `piFffAdapter(toolInfo)`.
- [pi-mcp-adapter](../src/adapters/pi-mcp-adapter/README.md): `piMcpAdapter(toolInfo)`.
- [pi-todo](../src/adapters/pi-todo/README.md): `piTodoAdapter(toolInfo)`.
- [pi-selective-read](../src/adapters/pi-selective-read/README.md): `piSelectiveReadAdapter(toolInfo)`.
- [pi-smart-compact](../src/adapters/pi-smart-compact/README.md): `piSmartCompactAdapter(toolInfo)`.
