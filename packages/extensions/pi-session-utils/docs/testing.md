# Session management test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests session persistence, parent lookup, the startup flag, and naming requests. [OwnedHooks](../../../libs/src/owned-hooks/README.md) owns property restoration; Pi owns session reconstruction, metadata serialisation, later persistence, and provider-specific reasoning mappings.

## Must not regress

- **Critical, e2e:** Missing or invalid merged naming settings, an unavailable configured model, or an unsupported thinking level prevent naming requests rather than falling back to the active model.
- **Critical, integration:** Parent lookup leaves file contents unchanged, including older supported session headers, whether the parent is selected by path or exact ID.
- **Critical, integration:** A persistence switch error leaves the saved snapshot available for recovery, including when the error occurs after session replacement.
- **Critical, integration:** An explicitly cancelled persistence switch removes only the newly saved snapshot.
- **High, e2e:** Superseded or cancelled naming results do not change the session name, even when the provider ignores cancellation.
- **High, integration:** Invalid `--parent-session` startup exits nonzero in a real process before executing the prompt.

## Not tested

- Busy-agent warnings, command surface and completion, child creation guidance, title formatting, and request text limits: below the severity bar.
- Paid model requests, title quality, exporting other branches, terminal rendering, and provider authentication: out of scope or owned by Pi.
