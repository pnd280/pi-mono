# Loading and recovery

[User interface consistency audit](../SKILL.md)

Compare readiness, absent data, restrictions, and recoverable failures.

## Checks

- Are loading, empty collections, no matches, and unavailable data distinct?
- Do read-only/recovery messages explain remaining actions?
- Do controls reflect loading cancellation and access restrictions?
- Are retry routes such as refresh, switching, reopening, or reload clear?
- Do cached failures/async preparation avoid implying retries already started?
- Does failure preserve enough query, selection, and content to recover?

## Evidence

Reproduce relevant initial, pending, failed, and recovered states with disposable fixtures. Verify retry claims against reload/cache behavior. Unavailable sources are not empty results merely because neither shows items.
