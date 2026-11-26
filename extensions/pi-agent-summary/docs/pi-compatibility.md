# Pi compatibility for maintainers

[pi-agent-summary](../README.md)

> Last verified against Pi 1.6.1 with package checks, offline tests, and a source review of the Pi 1.6.0 to 1.6.1 changes. Not covered: manual visual checks; counting of `bash` calls skipped by an abort in a real host; live-provider usage reporting; nested `bash` counting and virtual-model attribution in a real host; and a quit during a run through Pi's own runtime, whose order the offline host fixture copies.

## Upgrade procedure

Run the [manual checks](testing.md#manual-checks).

## Checklist

### Lifecycle

Confirm these items against [src/index.ts](../src/index.ts):

- [ ] A run lasts from the first `agent_start` to `agent_settled`, through retries, queued follow-ups, and cancellation.
- [ ] The live timer is cleaned up when the run ends.
- [ ] The [lifecycle run marks](../../../libs/src/lifecycle/phases.md#run-marks) supply the duration and finish time.
- [ ] Direct and nested agent `bash` calls count once per call ID.
- [ ] Manual shell input is excluded from the command count.
- [ ] [Milestones and counters](../GLOSSARY.md) emitted on `pi.events` reach the active run synchronously.
- [ ] Reload removes the old `pi.events` subscriptions.
- [ ] A run that a quit or a session replacement cancels reaches the settle handler before the [shutdown revoke](../../../libs/src/lifecycle/phases.md#shutdown-phase), so its summary is saved.
- [ ] Pi rejects a reload while a run is active.

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

- [ ] Assistant `message_end` messages carry `durationMs`, the time from the request start to the end of the response, including for cancelled and failed responses.
- [ ] `message_update` carries `text_delta`, `thinking_delta`, and `toolcall_delta` events.
- [ ] Empty text and tool-call deltas do not start the visible-output clock.
- [ ] A completed `message.usage.output` includes reasoning exactly once.
- [ ] Reported output usage from cancelled and failed responses contributes to throughput.
- [ ] Tool and nested usage is excluded from throughput.
- [ ] Throughput combines output tokens and response times across continuations.
- [ ] Summaries save throughput outside the TUI.

### Persistence and rendering

Confirm persistence and rendering in [src/index.ts](../src/index.ts):

- [ ] `appendEntry` keeps summaries out of model context.
- [ ] Resuming a session restores its summaries.
- [ ] The tool-output shortcut expands and collapses all summaries.
- [ ] In fullscreen mode, a mouse click expands and collapses one summary.
- [ ] Outside the TUI, `appendEntry` still saves summaries.

## Limitations

In Pi 1.5.2 to 1.6.1, Pi records the time for a streamed assistant response in `AssistantMessage.durationMs`. Legacy messages and deferred results fetched later can lack this field. Saved [output throughput](summary-fields.md#output-throughput) uses responses with a positive duration and depends on the output usage the provider reports.

In Pi 1.6.0 and 1.6.1, Pi emits `tool_execution_start` for each call in a tool batch, including calls that an abort prevents from running. A skipped call gets an "Operation aborted" result, so [`ran N commands`](summary-fields.md#commands) counts these `bash` calls.

In Pi 1.6.1, closing the terminal on Windows follows the signal shutdown path, which waits for the run to settle before it emits `session_shutdown`. The offline tests do not cover closing a terminal on Windows.
