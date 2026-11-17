# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Instruction notices from [`pi-nested-instructions`](../../../../pi-nested-instructions/README.md) appear as compact cards that expand to the instruction text. See [nested-instruction cards](../../../docs/tools.md#nested-instructions).

## Compatibility and registration

The adapter renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`. The [adapter contract](contract.md) covers the notice details, the display, and the limits.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Validation

Notice rendering, counts, and replay are [outside automated coverage](../../../docs/testing.md#not-tested). Use the [nested-instruction notice checks](../../../docs/validation.md#nested-instruction-notices) and the [nested-instruction summary checks](../../../docs/validation.md#with-nested-instructions).
