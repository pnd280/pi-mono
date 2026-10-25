# Agent-summary test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests what saved [run summaries](../GLOSSARY.md) contain, when they are saved, and run isolation; libs owns diffing, tree-row layout, and native-tool observation, and Pi owns native file operations.

## Must not regress

The e2e [lifecycle scenario](../src/lifecycle.test.ts) drives retried runs, reloads, and shutdown through a real offline host. In Pi 1.4.0, reload and session replacement shut down the old extension instance and start a new one, so the scenario resets the session with reload. The e2e [nested-execution scenario](../src/nested-execution.test.ts) drives one nested run. The [lifecycle fixture](../src/test-fixture.ts) delivers synthetic events and lazily creates one offline session for real `edit` and `write` calls. It covers two races that the host does not produce on demand: a busy session at settlement, because Pi 1.4.0 defers prompts that handlers send during settlement, and a native write that completes after its run ended and another run started.

- **Critical, e2e:** Saved summaries contain run metadata and file statistics or unavailability reasons, not file contents or patches.
- **High, e2e:** Appending a summary with `appendEntry` leaves the model's session context unchanged.
- **High, unit:** Files whose statistics stay unavailable, including after a failed final write or an unobserved write between native operations, are recorded as unavailable, not as zero changes.
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

These checks cover theme colours and terminal appearance. Launch `vp exec pi -e ./packages/extensions/pi-agent-summary -e ./packages/extensions/pi-todo -e ./packages/extensions/pi-tool-display` from the repository root, and run each check in regular and fullscreen modes.

| Do                                               | Expect                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Ask the agent to run `bash`, `edit`, and `write` | The timer counts up live, and a summary appears when it settles.                                           |
| Watch the working message during a long response | `n/s` estimates the response while text streams. After the response, it shows the run rate.                |
| Click a summary in fullscreen; press **Ctrl+O**  | Clicking toggles one summary; **Ctrl+O** toggles all of them. Expanded summaries show statistics per file. |
| Narrow the terminal                              | The summary wraps with a four-column indent, behind a `│` guide when the expanded file tree follows.       |
| Emit a long milestone during a run               | Its line shows above the summary, wraps with a two-column indent, and shows again after resume.            |
| Emit one counter twice during a run              | The summary line shows its segment with count 2 after the command count, and shows again after resume.     |
| Abort a run, then resume the session             | The timer and rate are gone, and saved summaries show again.                                               |
