# Agent-summary test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests what saved run summaries contain, when they are saved, and run isolation. Libs owns diffing, tree-row layout, and native-tool observation; Pi owns native file operations. The [lifecycle fixture](../src/test-fixture.ts) delivers synthetic events and lazily creates one offline session for real `edit` and `write` calls.

## Must not regress

- **Critical, e2e:** Saved summaries contain run metadata and file statistics or unavailability reasons, not file contents or patches.
- **High, e2e:** Appending a summary with `appendEntry` leaves the model's session context unchanged.
- **High, unit:** Files whose statistics stay unavailable, including after a failed final write, are recorded as unavailable, not as zero changes.
- **High, e2e:** A started run appends exactly one summary at an idle `agent_settled`, unless a session reset or shutdown discards it before persistence.
- **High, e2e:** A run started after settlement, session reset, or shutdown begins without the previous run's accumulated statistics.
- **High, e2e:** Settlement, session reset, and shutdown stop the live timer's interval.

## Not tested

- Run timing, answering-model lists, throughput, command counts, file-statistic deduplication, and rendering: below the severity bar.
- Inferring file changes from bash, and the correctness of native operations: out of scope or owned by Pi.
- Shared [tree-row layout](../../../libs/src/tui/components/tree/README.md): owned by libs.

## Manual checks

Theme colours and terminal appearance: use the README's [manual checks](../README.md#validation).
