# Runtime validation

[Workspace development](../development.md)

Use Zod for configuration, persisted JSON, external structured data, and option limits. Colocate schemas with their owner, derive owned types, and export shared contracts.

- Choose unknown-key and failure handling: settings may recover fields or reject everything; stored documents may retain unknown fields for recovery.
- Use parsed output for normalisation, but validate without replacement when preserving borrowed data or exact stored source.
- Limit original record sizes, including unknown fields.
- Hide raw validation errors that could expose stored content.

For Zod-based model-facing parameters, use [`toToolSchema`](../../packages/libs/src/tool-schema/README.md) from `@pi-mono/libs/tool-schema`, not direct Zod-to-TypeBox conversion or local keyword stripping. Its explicit profile omits runtime metadata and unsupported integer bounds while rejecting unhandled keywords. State omitted constraints in descriptions (explicit integer bounds require one) and enforce full validation before side effects. Valid arguments do not prove provider acceptance.

Schemas are unnecessary for control-flow narrowing, host capability checks, or invariants that depend on filesystem or lifecycle state.
