# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Instruction notices from [`pi-nested-instructions`](../../../../pi-nested-instructions/README.md) appear as compact cards that expand to the instruction text. See [nested-instruction cards](../../../docs/tools.md#nested-instructions).

## Compatibility and registration

The adapter renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`. The producer owns the persisted schema and model-facing preamble; this adapter owns presentation only and performs no discovery, filesystem access, or persistence. Its [card renderer](../../rendering/notice.ts) lives with the shared card layout.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Display

[Nested-instruction cards](../../../docs/tools.md#nested-instructions) describes what users see. Body formatting waits until expansion. Summary counts come only from validated notice details.

## Validation

Notice rendering, counts, and replay are [outside automated coverage](../../../docs/testing.md#not-tested).

Use the manual checks and the [nested-instruction summary checks](../../../docs/validation.md#with-nested-instructions).

Load both extensions in a disposable workspace. Use compact mode so run summaries do not hide the notices.

| Do                                                                | Expect                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Access a nested directory containing `AGENTS.md`.                 | The collapsed notice shows its action and path.                      |
| Expand the notice with the shortcut or a fullscreen header click. | The body shows formatted Markdown without the model-facing preamble. |
| Resize to narrow widths and compare dark and light themes.        | Text stays readable within the available width.                      |
| Select or scroll the expanded body.                               | The notice keeps its expansion state.                                |
