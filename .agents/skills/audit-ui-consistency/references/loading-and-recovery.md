# Loading and recovery

[Return to the UI consistency audit](../SKILL.md).

Compare readiness, absent data, restrictions, and recoverable failures.

## Checks

- Distinguish loading, empty collections, no matches, and unavailable data. Unavailable sources are not empty results simply because neither shows items.
- Explain remaining actions in read-only and recovery messages.
- Match controls to loading cancellation and access restrictions.
- Make retry routes clear, including refresh, switching, reopening, or reload.
- Match cached-failure and asynchronous-preparation messages to whether a retry has actually started.
- Preserve enough query, selection, and content after failure for recovery.

## Evidence

Reproduce relevant initial, pending, failed, and recovered states with disposable fixtures. Verify retry claims against actual reload and cache behavior.
