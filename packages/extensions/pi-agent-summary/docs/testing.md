# Agent-summary test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests what saved [run summaries](../GLOSSARY.md) contain, when they are saved, and run isolation; libs owns the tree-row layout of wrapped summary lines.

## Must not regress

The e2e [lifecycle scenario](../src/lifecycle.test.ts) drives retried runs, reloads, and shutdown through a real offline host. In Pi 1.5.2, reload and session replacement shut down the old extension instance and start a new one, so the scenario resets the session with reload. A second e2e scenario in the same file saves a summary from an SDK session bound in RPC mode.

Following Pi's [lifecycle contracts](pi-compatibility.md#lifecycle), the scenario reloads only after a run settles, and its last step disposes the [shared host fixture](../../../libs/src/validation/interactive-host/README.md) during a run, as a quit does.

The [lifecycle fixture](../src/test-fixture.ts) delivers synthetic events for a session reset or shutdown during an active run, which the host does not produce on demand, because Pi 1.5.2 rejects a reload and settles a cancelled run first. These two cases are an exception to the e2e layer: only they cover the session-reset clause of run isolation and the session-reset and shutdown clauses of stopping the timer.

- **High, e2e:** Appending a summary with `appendEntry` leaves the model's session context unchanged.
- **High, e2e:** A started run appends exactly one summary at `agent_settled`.
- **High, e2e:** A run started after settlement or session reset begins without the previous run's accumulated summary data.
- **High, e2e:** After shutdown, an `agent_start` before the next `session_start` starts no run and saves no summary.
- **High, e2e:** Settlement, session reset, and shutdown stop the live timer's interval.

## Not tested

- Run timing, answering-model lists, throughput calculations, live-rate formatting, command counts, [milestone](../GLOSSARY.md) limits and deduplication, counter limits and merging, and rendering are below the severity bar. Isolation scenarios use representative accumulated state only to check that it does not carry into another run.
- Libs owns the shared [tree-row layout](../../../libs/src/tui/components/tree/README.md).

## Manual checks

These checks cover theme colours and terminal appearance. Launch `vp exec pi -e ./packages/extensions/pi-agent-summary -e ./packages/extensions/pi-todo -e ./packages/extensions/pi-tool-display` from the repository root, and run each check in regular and fullscreen modes.

| Do                                               | Expect                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Ask the agent to run a `bash` command            | The timer counts up live, and a summary appears when it settles.                                             |
| Watch the working message during a long response | `n/s` estimates the response while text streams. After the response, it shows the run rate.                  |
| Click a summary in fullscreen; press **Ctrl+O**  | Clicking toggles one summary; **Ctrl+O** toggles all of them. Expanded summaries show the local finish time. |
| Narrow the terminal                              | The summary wraps with a four-column indent.                                                                 |
| Emit a long milestone during a run               | Its line shows above the summary, wraps with a two-column indent, and shows again after resume.              |
| Emit one counter twice during a run              | The summary line shows its segment with count 2 after the command count, and shows again after resume.       |
| Abort a run, then resume the session             | The timer and rate are gone, and saved summaries show again.                                                 |
