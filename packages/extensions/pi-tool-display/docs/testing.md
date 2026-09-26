# Tool-display coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

### Selection and result interpretation

- Specialize only verified native/extension contracts. Respect exact renderer overrides and project trust; invalid settings preserve original renderers and disable display observations. Preserve custom renderer slots and generic fallbacks without enabling tools.
- Interpret only published data and validated adapter facts. Never recover omitted output from metadata, infer cancellation from prose, or mutate borrowed results. Literal notice lookalikes remain source.
- FFF scopes/diagnostics, MCP routing/media/error identity, todo snapshots, and selective-read preview provenance have adapter-specific semantics. Invalid or partial contracts fall back without claiming unrelated tools. Selective-read recognition uses the shared projected schema without integer bounds; installed-CLI coverage loads the actual extension so fixture drift cannot hide schema incompatibility.
- Smart-compact cards distinguish requesting compaction from completing it, retain instruction focus without raw parameters by default, and label only valid saved model/thinking selections. Hide only the recognized successful acknowledgement already represented by the heading; arbitrary text, errors, and partial results stay unchanged. Context-window cards summarize supplied token/capacity/percentage facts without calculating missing values or treating unknown usage as zero; expansion restores raw output. Collapsed/expanded rendering and reused rows must not mutate agent-facing content, retain stale facts, or infer selections from current settings.

### Transcript and rendering

- Group contiguous compatible scopes in source order, not by tool name alone. Visible transcript boundaries split groups; hidden completed thinking can merge them. Streaming, finalized content, and late adapters may regroup calls without duplicating members or changing unrelated expansion state.
- Keep diagnostics/images with their source call and visible when compact text is hidden. Errors, cancellations, unavailable outcomes, and success remain distinguishable. Expansion restores retained content, not fabricated history.
- Renderer call/result slots share current call facts, including when rows are reused. Refresh on updates/theme invalidation and avoid preparing hidden or unbounded bodies during redraw. Parameters follow adapter policy and settings while preserving routing/path summaries.
- Diff, shell preview, and omission rendering preserve source and distinguish generated annotations. Diff unavailability distinguishes queue overload and worker failures from per-diff work limits. Compact budgets retain meaningful changes and both ends of long targets.

### Observation and lifecycle

- Observe native operations only in participating TUI sessions, preserving native settings, middleware results, schemas, active tools, and other observers without duplicating native I/O. Display errors cannot change execution outcomes.
- Persist bounded operation/cancellation/patch facts outside model context. Replay only matching ancestry, never rerun operations, reobserve mutations, or animate incomplete history.
- Saved-output reads start only for eligible expanded completed calls. Bound loads and cache size, retry on re-expansion after saturation, and reject completions for obsolete paths or disposed sessions without losing published failures.
- Reload/removal restores only owned hooks, preserves later wrappers, and makes old callbacks inert. Real host reconstruction, compaction, expansion, mouse routing, and thinking integration must still work through the installed CLI's bundled contracts.

## Coverage boundaries

This package owns adapter interpretation, display policy, transcript state, and integration with Pi's private APIs. [Libraries](../../../libs/docs/testing.md) own native verification/shared mutation protocols, UTF-8 stream/file retention, async caches, terminal safety, highlighting, and diff geometry. [Utils](../../../utils/docs/testing.md) own patch/selection/path parsing. Retain consumer checks of configured budgets and wiring, not duplicate algorithm matrices. Performance assertions should bound repeated work rather than require a particular internal call sequence.

Offline provider scenarios own tool-plan order, streaming and buffered events, context-based continuation, and explicit unavailable-tool skips. Exercise these in-process with virtual time rather than waiting through human-facing animation delays. Installed-CLI smoke tests retain extension loading, native read errors/images, and mutation/resume checks; the full visual scenario matrix remains manual. Host and transcript tests own the resulting display behavior.

## Exclusions

No paid/live MCP or FFF search requests, upstream tool execution matrices, or native persistence internals. Full ANSI snapshots and repeated color-only permutations are not substitutes for visible lifecycle/content contracts. Terminal image protocols, drag selection, visual themes, and platform-specific shell behavior need [manual checks](validation.md); headless render assertions do not establish them.
