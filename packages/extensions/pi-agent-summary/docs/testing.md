# Agent-summary coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- A run uses monotonic time across turns, retries, and follow-ups until settlement; repeated starts do not reset it. Shutdown/reload discard unfinished runs and late statistics and stop UI timers.
- Settlement appends one summary outside model context, capturing the finish time before asynchronous statistics complete. Persist statistics, never source text or patches. Non-TUI runs persist without UI timers; cleanup preserves other working-message contributions.
- Bash calls count once at start, including blocked/unfinished calls, excluding manual shell input.
- File statistics deduplicate canonical paths and compare the first observed original contents with the final written contents in mutation order, not callback order. Reverts disappear and empty creations count. Unavailable endpoints, including failed final writes, are not zero changes.
- Retention limits and diff failures report unavailability, distinguishing queue overload and worker failures from per-diff work limits. A single native patch can supply statistics when source retention cannot support a comparison; intermediate failures do not invalidate known endpoints.
- Persisted summaries reject malformed records and combine duration, local finish time, and statistics on one compact line, wrapping on narrow terminals. Available totals remain distinct from unavailable files; per-file details preserve independent click/global expansion behavior.

## Coverage boundaries

This package owns run accumulation, summary schema, timing policy, and host subscription. [Libraries](../../../libs/docs/testing.md) own native mutation verification, shared I/O, canonicalization, patch generation, and working-message coordination. Keep a real native `edit`/`write` integration proving subscription and aggregation, including aliases and sources larger than 64 KiB, not another matrix of shared diff algorithms.

Exercise timer cleanup, continuations, and non-TUI behavior through lifecycle events; isolate monotonic-clock jumps at the timer seam. Renderer checks protect retained data, saved finish-time selection, unavailable totals, and expansion interactions. Verify diagnostic categories rather than complete prose.

## Exclusions

No bash filesystem inference, dependency-owned native operation correctness, locale-specific clock snapshots, exact summary prose, or rendered-row inventories. Theme colors and wrapping belong to the README's [visual checks](../README.md#validation); do not assert theme callback calls or incidental component structure.
