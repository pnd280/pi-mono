# Null-argument test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests which arguments reach the tool after cleaning; Pi owns argument validation and the removal of real `null` values.

## Must not regress

- **High, e2e:** An optional top-level tool argument sent as the text `"null"` is removed before validation for [supported schemas](../README.md#behaviour).
- **High, e2e:** Required arguments and other top-level values reach the tool unchanged.
- **High, e2e:** Nested object and array argument values, including the literal text `"null"`, reach tools unchanged.

## Not tested

- Calls to unknown tools and non-assistant messages are below the severity bar. The extension leaves them unchanged.
