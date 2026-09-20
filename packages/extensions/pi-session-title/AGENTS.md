# [pi-session-title](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): Pi event and command adapter.
- [src/config.ts](src/config.ts): validation and merging of global and trusted project settings.
- [src/source.ts](src/source.ts): first-request and current-branch text selection.
- [src/generate.ts](src/generate.ts): title generation and sanitization.
- [src/runtime.ts](src/runtime.ts): automatic naming, cancellation, and guarded title updates.
- [validation/](validation/): offline Pi host and process tests with a fixture provider.

## Constraints

- Preserve [configuration rules](README.md#configuration); reject invalid settings before requests to prevent sending conversation text to a fallback model.
- Use Pi's authentication and thinking APIs. Do not duplicate provider-specific reasoning mappings.
- Reuse [LatestTask](../../libs/src/latest-task/README.md) for stale-result protection and [terminal-text](../../libs/src/tui/terminal-text/README.md) for terminal safety and Unicode-safe boundaries. Cancel underlying I/O separately.
- Use Pi's session-name API and notifications, never conversation messages or custom stdout.

## Validation

Use [package validation](README.md#validation). Keep model tests offline. Cover the one-attempt limit, cancellation across session changes, manual and external name changes, and settings reloads.
