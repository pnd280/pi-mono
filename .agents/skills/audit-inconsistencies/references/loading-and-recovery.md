# Loading and recovery

[Consistency audit](../SKILL.md)

Compare how surfaces communicate readiness, absence of data, access restrictions, and recoverable failures.

## Checks

- Are loading, an empty collection, no search matches, and unavailable data visibly distinct?
- Do read-only and restricted-recovery messages explain what the user can still do?
- Do controls reflect the current state, including cancellation during loading and actions disabled by access restrictions?
- Does a recoverable failure explain how to retry, such as refreshing, switching views, reopening, or reloading?
- Do cached failures and asynchronous preparation avoid implying that a retry or refresh is already underway?
- Does a failed operation retain enough query, selection, or content context for the user to recover predictably?

## Evidence

Reproduce the relevant initial, pending, failed, and recovered states with disposable fixtures. Check the advertised retry action against reload and cache behavior. Do not classify an unavailable source as an empty result merely because both render no items.
