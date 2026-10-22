# Pi compatibility for maintainers

[pi-agent-summary](../README.md)

> Last verified against Pi 1.4.0 with package checks, offline tests that include real codemode and virtual-model cases, and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: manual visual checks.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and the README [manual checks](../README.md#validation).
2. When affected, check the other file-mutation consumer (`pi-tool-display`) and working-message composition with `pi-todo`.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Recheck [run](../GLOSSARY.md) lifecycle boundaries, attribution, and native file observations against the installed Pi version.

### Lifecycle

Confirm these items against [src/index.ts](../src/index.ts):

- [ ] A run lasts from the first `agent_start` to `agent_settled`, through retries, queued follow-ups, and cancellation.
- [ ] The live timer is cleaned up when the run ends.
- [ ] The [lifecycle run marks](../../../libs/src/lifecycle/README.md#run-marks) supply the duration and finish time.
- [ ] Direct and nested agent `bash` calls count once per call ID.
- [ ] Manual shell input is excluded from the command count.
- [ ] [Milestones and counters](../GLOSSARY.md) emitted on `pi.events` reach the active run synchronously.
- [ ] Reload removes the old `pi.events` subscriptions.

### Answering models

Confirm the run metadata in [src/index.ts](../src/index.ts):

- [ ] Assistant `message_end` events name the answering `provider`, `model`, and requested `thinkingLevel`.
- [ ] Under a virtual selection, these fields name the routed physical model.
- [ ] Failed or aborted routing leaves `api: "pi-virtual"` on the message (Pi's unexported `VIRTUAL_MODEL_API`).
- [ ] Error responses don't add an answering model.
- [ ] The saved [summary schema](../src/summary.ts) accepts every host thinking level, missing levels, and missing model lists.
- [ ] The saved summary schema rejects empty model lists and models without a provider.

### Throughput

Confirm these items against [src/throughput.ts](../src/throughput.ts):

- [ ] Public assistant `message_start` and `message_end` events delimit response streams.
- [ ] `message_update` carries `text_delta`, `thinking_delta`, and `toolcall_delta` events.
- [ ] Empty text and tool-call deltas do not start the visible-output clock.
- [ ] A completed `message.usage.output` includes reasoning exactly once.
- [ ] Reported output usage from cancelled and failed responses contributes to throughput.
- [ ] Tool and nested usage is excluded from throughput.
- [ ] Throughput combines output tokens and streaming time across continuations.
- [ ] Summaries save throughput outside the TUI.

### File statistics

Confirm these items against [src/changes.ts](../src/changes.ts):

- [ ] Only verified native operations contribute file statistics.
- [ ] Concurrent operations use the first and last contents in write order.
- [ ] Symlink aliases count as one file.
- [ ] Statistics reflect net changes, with reverted changes omitted.
- [ ] Unavailable statistics remain distinct from zero changes.

### Persistence and rendering

Confirm persistence and rendering in [src/index.ts](../src/index.ts):

- [ ] `appendEntry` keeps summaries out of model context.
- [ ] Resuming a session restores its summaries.
- [ ] The tool-output shortcut expands and collapses all summaries.
- [ ] In fullscreen mode, a mouse click expands and collapses one summary.
- [ ] Saved summaries hold metadata without file contents or patches, also outside the TUI.

## Limitations

In Pi 1.4.0, these limits come from missing Pi APIs. Revisit them when Pi adds one.

### Throughput

The client measures saved [output throughput](summary-fields.md#output-throughput), so it depends on when the provider's stream starts and on reported usage. Keep live estimates out of saved summaries. If Pi adds a public timing or throughput API, use it.

### File coverage

[Observation skips bash changes, overrides, and custom tools](summary-fields.md#file-changes). Revisit public mutation or run-summary APIs that report trustworthy outcomes and ordering, while keeping bounded retention and saving outside model context. Changes to shared observation belong in libs.
