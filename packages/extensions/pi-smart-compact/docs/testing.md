# Compaction test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Compatibility and terms](pi-compatibility.md)

This package tests credential isolation, session ownership of compaction requests, the distinction between cancellation and failure, and ownership of the native hooks it replaces; Pi owns summarisation and provider behaviour.

## Must not regress

E2e checks never use personal settings or credentials.

### Model and credential isolation

- **Critical, e2e:** Only valid settings from global or trusted project scopes select the summary provider and model. Invalid participating settings disable requested compaction.
- **Critical, e2e:** Configured summary requests use the selected provider's key, headers, environment, and base URL, not conversation-provider credentials.
- **Critical, e2e:** A failed model lookup, authentication, or summary generation does not fall back to the conversation model.
- **Critical, e2e:** Summary model and thinking overrides leave the conversation model and its thinking level unchanged.
- **Critical, e2e:** An operation with a different abort signal receives neither the owning compaction's focus nor its model and thinking overrides.
- **Critical, e2e:** Temporary summarisation, event, and stream overrides stop applying when their scoped attempt exits, including on errors.

### Failure and abort

- **Critical, e2e:** A requested compaction reported as failed or cancelled before native persistence preserves the existing conversation context, apart from its outcome status.
- **High, e2e:** Cancelling a requested compaction without aborting the agent run allows continuation with a cancellation status.
- **High, e2e:** Aborting the whole agent run prevents a further conversation-model request.
- **High, unit:** An unexpected native exception propagates without an extension outcome status.

### Session isolation

- **High, e2e:** Only direct model calls can schedule compaction, after their whole tool batch is persisted.
- **High, unit:** A pending request can be consumed only by its owning session, and a consumed request is not retried at a later boundary, including after a skip, cancellation, failure, or exception.
- **High, unit:** Settlement, binding disposal, or an abort detected before the boundary discards the pending request.
- **High, e2e:** Session replacement and reload dispose the old binding before binding the new session state.
- **High, e2e:** When an extension that loads earlier turns `context_window` off at session start, it stays off.
- **High, unit:** Disposing a binding during an attempt prevents late outcome status publication, and outcome listeners are released when the native attempt exits, including on exceptions.

### Hook ownership

- **High, unit:** Cleanup restores the original function and property ownership only where the extension still owns the hook, and leaves later replacements by other extensions in place.
- **High, unit:** Disposing one binding leaves other bound sessions' native routing active. Disposing the last binding restores the shared native hooks when all are still owned by this extension.
- **High, unit:** Binding rejects unsupported Pi versions, unreviewed native implementations, and detected conflicting boundary replacements without overwriting them. A failed installation rolls back hooks it already installed.

## Not tested

- Footer status and docs-file loading are below the severity bar. The native scenarios also check tool acknowledgements, outcome statuses, summary-model metadata, instruction-file focus, routing flags, and configured request timeout and retry options as part of the listed invariants.
- Several `compact` calls in one tool batch and summaries supplied by `session_before_compact` hooks are below the severity bar.
- Whether a real model follows the instructions is not tested because it needs a real provider. The [manual checks](pi-compatibility.md#manual-checks) cover summary quality.
- Pi owns threshold detection and the full overflow retry scheduler.
- Interactive mounting and terminal appearance are not tested automatically. The [manual checks](#manual-checks) cover them.
- Pi owns RPC display.
- Undoing Pi's earlier overflow-recovery edits, atomic metadata and compaction writes, and combinations of third-party patches and reloads are not tested, because the extension does not guarantee them. The [compatibility limits](pi-compatibility.md#limitations) explain why.

## Manual checks

Use the [compatibility manual checks](pi-compatibility.md#manual-checks) for interactive progress, **Escape** behaviour, and real-provider summary quality.
