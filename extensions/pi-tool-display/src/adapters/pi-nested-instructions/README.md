# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Instruction notices from [`pi-nested-instructions`](../../../../pi-nested-instructions/README.md) appear as compact cards that expand to the instruction text. This page documents the adapter contract for its maintainers; if you use `pi-nested-instructions`, read [Display](#display) for how its notices appear.

## Compatibility and registration

The adapter renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`. The producer owns the persisted schema and model-facing preamble; this adapter owns presentation only and performs no discovery, filesystem access, or persistence. Its [card renderer](../../rendering/notice.ts) lives with the shared card layout.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Display

Collapsed notices show `Loaded instructions`, `Updated instructions`, or `Removed instructions` and a path in the shared [card style](../../../docs/presentation.md#card-layout). Paths wrap like card targets. Body formatting waits until expansion.

Expand with Pi's tool-output shortcut (default **Ctrl+O**) or click the header in fullscreen mode to read formatted Markdown.

Only header clicks toggle the card; body selection and scrolling remain native. Paths use their persisted cwd-relative spelling. Invalid details retain supplied text beneath a generic heading.

Notices join the preceding owned tool [run](../../../GLOSSARY.md#transcript-structure), but do not cross unrelated messages or unowned tools. They separate exploration groups without ending a run; collapsed runs hide their notices, and standalone notices remain standalone.

Validated notices contribute loaded, updated, and removed counts to the run summary. Each persisted file path (directory for removals) counts once per action within the run. Invalid details and standalone notices contribute no counts to another run.

Tool-specific `rendererOverrides` and `showParameters` do not apply. Custom rendering does not affect model context or HTML export.

## Validation

Run the [package checks](../../../README.md#validation). Notice rendering, counts, and replay are [outside automated coverage](../../../docs/testing.md#not-tested).

Use the manual checks and the [nested-instruction summary checks](../../../docs/validation.md#with-nested-instructions).

Load both extensions in a disposable workspace. Use compact mode so run summaries do not hide the notices.

| Do                                                                | Expect                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Access a nested directory containing `AGENTS.md`.                 | The collapsed notice shows its action and path.                      |
| Expand the notice with the shortcut or a fullscreen header click. | The body shows formatted Markdown without the model-facing preamble. |
| Resize to narrow widths and compare dark and light themes.        | Text stays readable within the available width.                      |
| Select or scroll the expanded body.                               | The notice keeps its expansion state.                                |
