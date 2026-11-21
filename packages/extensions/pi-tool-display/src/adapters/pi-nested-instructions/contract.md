# Nested-instruction message adapter contract

[Nested-instruction message adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change notice or skill listing handling. [Nested-instruction cards](../../../docs/tools.md#nested-instructions) describes what users see.

## Arguments and results

The producer owns the persisted schemas and the model-facing preambles. Summary counts come only from validated notice and listing details. When a listing's details are valid, its card shows the skill names and descriptions from them, never the model-facing skill list. With invalid details, expansion shows the sanitised message text.

## Display

The [card renderers](../../rendering/notice.ts) live with the shared card layout. Body formatting waits until expansion.

## Limitations

This adapter owns presentation only, and performs no discovery, filesystem access, or persistence.
