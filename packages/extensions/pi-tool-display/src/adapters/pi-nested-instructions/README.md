# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

## Contract

Renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`. The producer owns the persisted schema and model-facing preamble; this adapter owns presentation only and performs no discovery, filesystem access, or persistence.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Display

Collapsed notices follow the [card style](../../../docs/presentation.md#card-layout): an accent bullet and bold accent action, followed by a normal-foreground path, such as `• Loaded src/AGENTS.md`. Long paths wrap beneath themselves, with a dim continuation guide when expanded.

Expand with Pi's tool-output shortcut (default `Ctrl+O`) or click the header in fullscreen mode to read formatted Markdown. Expanded content uses the same four-column tree gutter and dim connectors as tool results, without an extra blank row below the heading. Update/removal explanations continue the heading with a dim guide rather than forming their own branch; only the instruction body or empty-file note is a child branch. Explanations and empty-file notices use `dim`.

Local expansion survives renderer rebuilds until global expansion changes. Only header clicks toggle the card; body selection and scrolling remain native. Notice paths use the cwd-relative spelling persisted with the message, not the current cwd. Invalid details retain the supplied text beneath a generic heading rather than stripping an unverified preamble.

The host keeps notices inside the preceding owned tool run, without crossing unrelated visible messages or unowned tools. Notices separate exploration groups but neither split nor end the run. Collapsed runs hide their notice rows; opening restores them in source order, with the bottom collapse control after any trailing notices. Clicking a notice keeps a live run open without expanding its preceding tool group. Notices without a preceding run stay standalone.

Validated notices contribute `loaded N instruction files`, `updated N instruction files`, or `removed instructions from N dirs` to the run summary. Each persisted file path (directory for removals) counts once per action within the run, independently of tool outcomes and read counts. Categories follow their first notice's position among calls. Invalid details contribute no counts; notices following summary-omitted calls still count. Standalone notices do not contribute to another run.

Tool-specific `rendererOverrides` and `showParameters` do not apply. Custom rendering does not affect model context or HTML export.

## Validation

Run the [package checks](../../../README.md#validation). Adapter tests cover loaded/updated/removed notices, validated summary categories and persisted identities, local/global expansion, mouse filtering, narrow widths, terminal-safe paths, and unchanged model-facing content. Summary/coordinator tests cover per-action deduplication, ordering, omitted calls, boundary changes, and collapse controls. Host integration covers live/replayed run ownership and counts, source order, standalone notices, trailing collapse controls, saved messages, reload with discovery loaded, and default rendering after display removal.

For manual terminal validation, load both extensions in a disposable workspace and access a nested directory containing `AGENTS.md`. Expand/collapse its notice with the shortcut and fullscreen header clicks, resize to narrow widths, and check theme contrast and body selection. No paid model request is needed for automated tests.
