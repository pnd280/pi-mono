# Agent-summary coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- A run uses monotonic time across turns, retries, and follow-ups until settlement; repeated starts do not reset it. Shutdown/reload discard unfinished runs and late statistics and stop UI timers.
- Settlement appends one summary outside model context, capturing the finish time before asynchronous statistics complete. Persist statistics, never source text or patches. Non-TUI runs persist without UI timers; cleanup preserves other working-message contributions.
- Bash calls count once at start, including blocked/unfinished calls, excluding manual shell input.
- File statistics deduplicate canonical paths and compare the first observed original contents with the final written contents in mutation order, not callback order. Reverts disappear and empty creations count. Unavailable endpoints, including failed final writes, are not zero changes.
- Retention limits and diff failures report unavailability. A single native patch can supply statistics when source retention cannot support a comparison; intermediate failures do not invalidate known endpoints.
- Persisted summaries reject malformed records, render available totals separately from unavailable files, and preserve independent click/global expansion behavior.

## Coverage boundaries

This package owns run accumulation, summary schema, timing policy, and host subscription. [Libraries](../../../libs/docs/testing.md) own native mutation verification, shared I/O, canonicalization, patch generation, and working-message coordination. Keep a real native `edit`/`write` integration proving subscription and aggregation, not another matrix of shared diff algorithms.

## Exclusions

No bash filesystem inference, dependency-owned native operation correctness, locale-specific clock snapshots, or exhaustive color/layout permutations. Assert visible results rather than incidental component structure.
