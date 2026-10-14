# Null-argument test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests which arguments reach the tool after cleaning; Pi owns argument validation and the removal of real `null` values.

## Must not regress

- **High, e2e:** An optional top-level tool argument sent as the text `"null"` is removed before validation, and required arguments and other values reach the tool unchanged.

## Not tested

- Calls to unknown tools, nested arguments, and non-assistant messages pass through unchanged; a defect there leaves Pi's normal validation error, which is below the severity bar.
