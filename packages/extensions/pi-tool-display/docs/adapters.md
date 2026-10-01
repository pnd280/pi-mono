# Adapter development

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

A [display adapter](../GLOSSARY.md#interpretation) tells this extension how to read one tool's arguments and results. Adapters reach cards in two ways: a resolver in this package selects them automatically for verified tools, or a tool author attaches one directly to renderer fields through [standalone integration](renderers.md#custom-adapters). Follow the [display conventions](conventions.md) for wording.

## Add an adapter

1. Create `src/adapters/<extension-package>/index.ts` using the registering extension's full package name, including its scope. For example, use `src/adapters/@ff-labs/pi-fff/index.ts`. Pi's built-in extensions use `src/adapters/builtin/<extension-name>/`, matching their `builtin:<extension-name>` source path.
2. Export a [`ToolDisplayAdapterResolver`](../src/contracts.ts); verify provenance and the [required structural contract](#recognise-tool-contracts), not names alone. Return `undefined` for unsupported definitions.
3. Colocate [Zod schemas](../../../../docs/development.md#runtime-validation), presentation, and tests. Use `supports(args, result)` to reject uninterpretable CLI input; before results exist, `exploration` must reject unparseable partial arguments.
4. Document compatibility, contracts, display behaviour, limitations, and extension-specific validation in the adapter's `README.md`.
5. Add the resolver to `extensionAdapterResolvers` in [`src/host/selection.ts`](../src/host/selection.ts), following the [selection order](#automatic-selection).

To expose an adapter factory to tool authors, export it from [`src/adapters/index.ts`](../src/adapters/index.ts).

### Failure handling

Callbacks should return `undefined`, or reject through `supports`, rather than throw. If a callback does throw:

- Interpretation resolves all applicable metadata together, so the call never mixes specialised identities with generic outcomes. Standalone cards skip CLI-only fields; see [standalone callback failures](renderers.md#custom-adapters).
- After a presentation failure, the call stays generic through later updates. It leaves its exploration group and uses generic summary counts, but keeps `omitFromSummary`.
- The host warns once per adapter ID.

### Prohibited actions

Adapters must not enable or run tools, access files, persist data, modify borrowed arguments or results, or change model context. Native observation and unavailable-history notices need separate [host provenance checks](../README.md#what-is-recorded).

## Session-message adapters

Session messages use Pi's public `registerMessageRenderer` API from this extension's entry point, not the tool resolver list. Keep presentation under `src/adapters/<extension-package>/` and import the persisted identifier and decoder from the producing package's public contract. Do not load its extension factory for rendering.

The [pi-nested-instructions adapter](../src/adapters/pi-nested-instructions/README.md) owns instruction-notice cards and derives summary categories and identities from validated notice details. The host attaches their rows and summary contributions to the preceding call while retaining exploration-group boundaries. Tool renderer overrides and tool-adapter callbacks do not apply to these messages.

## Recognise tool contracts

Match verified provenance and the parameter structure the renderer needs: types, required fields, and object strictness where relevant. Do not fingerprint complete schemas or require numeric bounds, descriptions, or other details that provider-facing projection can omit or rewrite. Removing `minimum` from an integer coordinate, for example, must not disable its display adapter. Validate argument values and result shapes separately before specialised rendering.

Build schema fixtures through the registered tool's projection, and retain integration coverage that loads the extension. Projection changes also affect schema-inspecting consumers: run their adapter and installed-CLI checks, not just the producing tool's tests.

## Summary items

[Summary mode](presentation.md#summary-mode) uses internal adapter fields. They are not part of the [renderer API](renderers.md) yet and may change without notice.

- `omitFromSummary: true` excludes the owner's calls even when incompatible arguments or results need generic cards, as for todo bookkeeping. This static policy never interprets unsupported result facts.
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

Each adapter documents its contract in its own README. The [resolver list](../src/host/selection.ts) is the authoritative list for automatic tool selection.

| Source           | Adapters                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi native tools  | [Native contract](../src/adapters/native/README.md)                                                                                                                                                                                                                    |
| Pi built-ins     | [codemode](../src/adapters/builtin/codemode/README.md), [MCP](../src/adapters/builtin/mcp/README.md), [tool search](../src/adapters/builtin/tool-search/README.md)                                                                                                     |
| Extensions       | [FFF](../src/adapters/@ff-labs/pi-fff/README.md), [MCP adapter](../src/adapters/pi-mcp-adapter/README.md), [todo](../src/adapters/pi-todo/README.md), [selective read](../src/adapters/pi-read/README.md), [smart compact](../src/adapters/pi-smart-compact/README.md) |
| Session messages | [Nested instructions](../src/adapters/pi-nested-instructions/README.md), registered separately (see [session-message adapters](#session-message-adapters))                                                                                                             |
