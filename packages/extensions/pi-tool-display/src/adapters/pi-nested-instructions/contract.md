# Nested-instruction message adapter contract

[Nested-instruction message adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change notice handling. [Nested-instruction cards](../../../docs/tools.md#nested-instructions) describes what users see.

## Arguments and results

The producer owns the persisted schema and the model-facing preamble. Summary counts come only from validated notice details.

## Display

The [card renderer](../../rendering/notice.ts) lives with the shared card layout. Body formatting waits until expansion.

## Limitations

This adapter owns presentation only, and performs no discovery, filesystem access, or persistence.
