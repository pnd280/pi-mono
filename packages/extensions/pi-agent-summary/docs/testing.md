# Agent-summary coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- A run uses monotonic time across turns, retries, and follow-ups until settlement; repeated starts do not reset it. Shutdown/reload discard unfinished runs and late statistics and stop UI timers.
- Settlement appends one summary outside model context, capturing the finish time before asynchronous statistics complete. Persist statistics, never source text or patches. Non-TUI runs persist without UI timers; cleanup preserves other working-message contributions.
- Capture the model provider, ID, and selected thinking level at the run's first start. Later selections do not change or backfill that snapshot; the next run captures a fresh selection. Persisted summaries accept every supported thinking level, ignore unknown fields, and may omit model metadata but reject model metadata without a provider.
- Output throughput divides total reported assistant output tokens by total measured assistant stream time across continuations, excluding tool/nested usage and inter-message gaps. Reasoning is not added twice. Positive usage from failed/cancelled responses counts; unusable usage, zero-duration responses, unmatched ends, and unfinished streams do not. Timing remains monotonic and retains fractional milliseconds. No usable measurements means no throughput field or display; settlement and session resets cannot leak totals or active intervals into the next run.
- Bash calls count once at start, including blocked/unfinished calls, excluding manual shell input.
- File statistics deduplicate canonical paths and compare the first observed original contents with the final written contents in mutation order, not callback order. Reverts disappear and empty creations count. Unavailable endpoints, including failed final writes, are not zero changes.
- Retention limits and diff failures report unavailability, distinguishing queue overload and worker failures from per-diff work limits. A single native patch can supply statistics when source retention cannot support a comparison; intermediate failures do not invalidate known endpoints.
- Persisted summaries reject malformed records. Valid summaries combine the model (when saved), duration, optional output throughput, command counts, and file statistics on one line. Throughput appears once in both views, in parentheses next to the model when present, otherwise as a separate statistic. Available totals remain distinct from unavailable files.
- The summary begins with `•` when collapsed or `▾` when expanded, without outer padding. The marker and text are not italicized; throughput, command-count, and edited-file-count numbers remain bold. Narrow terminals wrap summary metadata with a two-column continuation indent.
- Only expanded summaries include the local finish time after the duration and per-file details as tree rows. Connectors are indented two columns, with `├` before each file except the final `└`. Wrapped file details use a four-column indent, retaining `│` while more files follow. Finish time and per-file details preserve independent click/global expansion behavior, including summaries without files.

## Coverage boundaries

This package owns run accumulation, summary schema, timing policy, and host subscription. [Libraries](../../../libs/docs/testing.md) own native mutation verification, shared I/O, canonicalization, patch generation, and working-message coordination. Keep a real native `edit`/`write` integration proving subscription and aggregation, including aliases and sources larger than 64 KiB, not another matrix of shared diff algorithms.

Exercise timer cleanup, continuations, and non-TUI behavior through lifecycle events; isolate monotonic-clock jumps at the timer seam. Renderer checks protect the leading marker and single-line metadata/statistics layout, retained data, expanded-only saved finish-time selection, throughput derived from saved stream totals rather than run duration, unavailable totals, and expansion interactions. Verify diagnostic categories rather than complete prose.

## Exclusions

No bash filesystem inference, dependency-owned native operation correctness, locale-specific clock snapshots, exact summary prose, or rendered-row inventories. Theme colors and terminal appearance belong to the README's [visual checks](../README.md#validation); do not assert theme callback calls or incidental component structure.
