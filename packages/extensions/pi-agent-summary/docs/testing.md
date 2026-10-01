# Agent-summary coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). For maintainers: this package tests run accumulation, the summary schema, timing policy, and host subscriptions.

## Must not regress

- Settlement appends exactly one summary, outside model context.
- Statistics are saved; source text and patches never are.
- Unavailable file endpoints, including failed final writes, never count as zero changes.
- Settlement and session resets never carry totals or active intervals into the next run.

## Run timing

- A run uses monotonic time across turns, retries, and follow-ups until settlement. Repeated starts don't reset it.
- The finish time is captured before asynchronous statistics complete.
- Shutdown and reload discard unfinished runs and late statistics, and stop UI timers.
- Native completions captured before a session reset cannot update the discarded run or its replacement.
- Runs outside the TUI are saved without UI timers.
- Cleanup keeps other working-message contributions.

## Answering models

- Each model that answered is recorded once, in order of first use across continuations: provider, ID, and requested thinking level when present. The selected model isn't recorded.
- Error responses and messages naming a virtual model don't count. Aborted physical responses do.
- A run with no other response has no model list.
- Saved summaries accept every supported thinking level and ignore unknown fields. The model list, or a level, may be missing. Empty lists and models without a provider are rejected.

## Output throughput

- Throughput is total reported assistant output tokens divided by total measured streaming time, across continuations.
- Tool and nested usage, and gaps between messages, are excluded. Reasoning isn't counted twice.
- Positive usage from failed or cancelled responses counts.
- Unusable usage, zero-duration responses, unmatched ends, and unfinished streams don't count.
- Timing is monotonic and keeps fractional milliseconds.
- With no usable measurement there is no throughput field and nothing is displayed.

## Commands and files

- Each `bash` call counts once, at start, including blocked and unfinished calls. Manual shell input is excluded.
- File statistics deduplicate canonical paths. They compare the first observed original with the final written contents, in mutation order rather than callback order.
- Reverts disappear, and empty creations count.
- Retention limits and diff failures report unavailability. Queue overload and worker failures are reported separately from per-diff work limits.
- A single native patch can supply statistics when retained sources can't support a comparison. Failures in between don't invalidate known endpoints.

## Rendering

Collapsed:

- Malformed saved records are rejected.
- One line combines the models (joined by `→`), duration, optional throughput, command count, and file statistics.
- Throughput appears once, in parentheses after the model when there is one, otherwise as its own statistic.
- Available totals stay distinct from unavailable files.
- The summary starts with `•` collapsed and `▾` expanded, without outer padding.
- Marker and text aren't italic. Throughput, command-count, and edited-file numbers are bold.
- On narrow terminals the line wraps with a two-column indent.

Expanded only:

- The local finish time follows the duration.
- Per-file details retain each path and its line counts or unavailability reason.
- Narrow rendering preserves metadata and file details within the width budget, with a two-column indent after the leading marker.
- Clicking and global expansion work independently, including for summaries with no files.

## How to test

- Keep one real native `edit` and `write` integration that proves subscription and aggregation, including aliases and sources over 64 KiB. Don't add another matrix of shared diff cases.
- Exercise timer cleanup, continuations, and behaviour outside the TUI through lifecycle events. Test monotonic-clock jumps at the timer seam.
- The [lifecycle fixture](../src/test-fixture.ts) delivers synthetic events without starting a native runtime.
- Its real-tool helper lazily creates one offline session using the event adapter's session manager, after observation is installed.
- Fixture teardown releases observations, timers, and temporary files even when native startup fails.
- Renderer tests protect the leading marker, the single-line layout, retained data within width budgets, the saved finish time shown only when expanded, throughput from saved stream totals rather than run duration, unavailable totals, and expansion.
- Check diagnostic categories, not full prose.

## Not covered here

- Inferring file changes from bash, and the correctness of native operations owned by Pi.
- Shared [tree-row connector and continuation layout](../../../libs/src/tui/components/tree/README.md), which is tested by libs.
- Locale-specific clock snapshots, exact summary prose, and lists of rendered rows.
- Theme colours and terminal appearance; use the README's [manual checks](../README.md#validation). Don't assert theme callback calls or incidental component structure.
