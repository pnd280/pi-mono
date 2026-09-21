# Pi compatibility

[pi-session-title](../README.md)

## Contracts to verify

- [ ] [Generation](../src/generate.ts): registry normalization, authentication, supported thinking, complete responses, safe errors, and request/cache defaults; preserve configured-model validation, no fallback, and no retries.
- [ ] [Lifecycle](../src/runtime.ts): one automatic attempt, branch/session/reload cancellation, manual/external name changes, and stale-result rejection.
- [ ] [Pi adapter](../src/index.ts): naming events and metadata-only updates in TUI, print, JSON, and RPC; no conversation messages or custom stdout.

## Limitations and replacement opportunities

- [Authentication/providers may ignore cancellation](../src/generate.ts). Revisit stronger request cancellation before simplifying the outer deadline; retain bounded waiting and stale-result protection.
- Compare new naming APIs with [source selection and naming policy](../README.md#usage). Adoption must preserve text limits, explicit model choice, and request side effects.

## Validation

Use [offline package/host/process checks](../README.md#validation), including timeout, cancellation, incomplete responses, settings reload, and naming races.
