# Nested-instruction message adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Instruction notices and skill listings from [`pi-nested-instructions`](../../../../pi-nested-instructions/README.md) appear as compact cards that expand to the instruction text or the skills. See [nested-instruction cards](../../../docs/tools.md#nested-instructions).

## Compatibility and registration

The adapter renders `pi-nested-instructions.notice` session messages using the identifier and decoder exported by `pi-nested-instructions/notices`, and `pi-nested-instructions.skills` messages using the identifier and schema exported by `pi-nested-instructions/skill-listings`. The [adapter contract](contract.md) covers the details, the display, and the limits.

Registration uses Pi's public message-renderer API, independent of tool selection and private tool-row hooks. Saved notices and listings render even without the discovery extension loaded. Without pi-tool-display, Pi displays the full messages using its default renderer.

## Validation

The visual rendering of notices and listings, their counts, and replay are [below the automated test bar](../../../docs/testing.md#not-tested) and are checked by hand. Use the [nested-instruction notice checks](../../../docs/validation.md#nested-instruction-notices), the [nested-skill listing checks](../../../docs/validation.md#nested-skill-listings), and the [nested-instruction summary checks](../../../docs/validation.md#with-nested-instructions).
