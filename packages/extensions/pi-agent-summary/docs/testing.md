# Agent-summary test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests what saved [run summaries](../GLOSSARY.md) contain, when they are saved, and run isolation; libs owns diffing, tree-row layout, and native-tool observation, and Pi owns native file operations.

## Must not regress

The [lifecycle fixture](../src/test-fixture.ts) delivers synthetic events and lazily creates one offline session for real `edit` and `write` calls.

- **Critical, e2e:** Saved summaries contain run metadata and file statistics or unavailability reasons, not file contents or patches.
- **High, e2e:** Appending a summary with `appendEntry` leaves the model's session context unchanged.
- **High, unit:** Files whose statistics stay unavailable, including after a failed final write, are recorded as unavailable, not as zero changes.
- **High, e2e:** A started run appends exactly one summary at an idle `agent_settled`, unless a session reset or shutdown discards it before persistence.
- **High, e2e:** A run started after settlement or session reset begins without the previous run's accumulated statistics.
- **High, e2e:** After shutdown, an `agent_start` before the next `session_start` starts no run and saves no summary.
- **High, e2e:** Settlement, session reset, and shutdown stop the live timer's interval.

## Not tested

- Run timing, answering-model lists, throughput calculations, live-rate formatting, command counts, file-statistic deduplication, [milestone](../GLOSSARY.md) limits and deduplication, counter limits and merging, and rendering are below the severity bar. The listed scenarios compare whole saved summaries, so they also fail when these fields change.
- Inferring file changes from bash is not tested because the package never infers them.
- Pi owns the correctness of native file operations.
- Libs owns the shared [tree-row layout](../../../libs/src/tui/components/tree/README.md).

## Manual checks

The README [manual checks](../README.md#validation) cover theme colours and terminal appearance.
