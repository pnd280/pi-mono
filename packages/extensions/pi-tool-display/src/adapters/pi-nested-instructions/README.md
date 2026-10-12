# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

## Contract

The adapter renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`. The producer owns the persisted schema and model-facing preamble; this adapter owns presentation only and performs no discovery, filesystem access, or persistence. Its [card renderer](../../rendering/notice.ts) lives with the shared card layout.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Display

Collapsed notices show `Loaded instructions`, `Updated instructions`, or `Removed instructions` and a path in the shared [card style](../../../docs/presentation.md#card-layout). Paths wrap like card targets. Body formatting waits until expansion.

Expand with Pi's tool-output shortcut (default **Ctrl+O**) or click the header in fullscreen mode to read formatted Markdown.

Only header clicks toggle the card; body selection and scrolling remain native. Paths use their persisted cwd-relative spelling. Invalid details retain supplied text beneath a generic heading.

Notices join the preceding owned tool run, but do not cross unrelated messages or unowned tools. They separate exploration groups without ending a run; collapsed runs hide their notices, and standalone notices remain standalone.

Validated notices contribute loaded, updated, and removed counts to the run summary. Each persisted file path (directory for removals) counts once per action within the run. Invalid details and standalone notices contribute no counts to another run.

Tool-specific `rendererOverrides` and `showParameters` do not apply. Custom rendering does not affect model context or HTML export.

## Validation

Run the [package checks](../../../README.md#validation). Adapter, summary coordinator, and host integration tests cover notice rendering, counts, and replay.

For manual terminal validation, load both extensions in a disposable workspace. Use compact mode so run summaries do not hide the notices. No paid model request is needed for automated tests.

| Do                                                                                                                      | Expect                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Access a nested directory containing `AGENTS.md`, then expand its notice with the shortcut or a fullscreen header click | The collapsed notice shows its action and path. Expansion shows formatted Markdown without the model-facing preamble. |
| Resize to narrow widths, compare dark and light themes, and select or scroll the body                                   | Text stays within the available width and remains readable. Body interaction does not toggle the notice.              |
