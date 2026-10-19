# Session management test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests session persistence, parent lookup, the startup flag, and naming requests. [OwnedHooks](../../../libs/src/owned-hooks/README.md) owns property restoration; Pi owns session reconstruction, metadata serialisation, later persistence, and provider-specific reasoning mappings.

## Must not regress

- **Critical, e2e:** Untrusted project or ancestor settings cannot choose the outbound naming provider.
- **Critical, e2e:** Provider authentication errors cannot expose credential-bearing error content in naming feedback.
- **Critical, e2e:** Missing or invalid merged naming settings, an unavailable configured model, or an unsupported thinking level prevent naming requests rather than falling back to the active model.
- **Critical, integration:** Parent lookup leaves file contents unchanged, including older supported session headers, whether the parent is selected by path or exact ID.
- **Critical, e2e:** Parent selection and child creation record exactly one valid, existing parent, without changing it or reapplying the startup flag after reload or replacement.
- **Critical, integration:** Snapshot creation preserves the selected history, entry IDs and links, current name or clearing, and source data. It never rewrites an already-saved session.
- **Critical, integration:** A persistence switch error leaves the saved snapshot available for recovery, including when the error occurs after session replacement.
- **Critical, integration:** An explicitly cancelled persistence switch removes only the newly saved snapshot.
- **High, e2e:** Completed naming leaves print text and JSON protocol output valid, with title changes only in native session metadata.
- **High, e2e:** Superseded or cancelled naming results do not change the session name, even when the provider ignores cancellation.
- **High, integration:** Invalid `--parent-session` startup exits nonzero in a real process before executing the prompt.

## Not tested

- Busy-agent warnings, command surface and completion, child creation guidance, notification text, title formatting, and request text limits: below the severity bar.
- Rejection of incomplete or thinking-only title responses, title token budgets for virtual models, and the retry policy after tree navigation: below the severity bar. The token budget is a [compatibility check](pi-compatibility.md#generation).
- Settings file encoding and size limits: owned by the [settings-file library](../../../libs/src/settings-file/README.md).
- Paid model requests, title quality, exporting other branches, terminal rendering, and provider authentication mechanisms: out of scope or owned by Pi.
