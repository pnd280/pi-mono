# Pi compatibility for maintainers

[pi-agent-summary](../README.md)

> Last verified against Pi 1.0.2 (package checks and offline tests, real codemode and virtual-model coverage, shared mutation and display suites; no runtime changes needed). Not covered: manual visual checks.

## Upgrade procedure

1. Run the [package and manual checks](../README.md#validation).
2. When affected, check the other file-mutation consumer (`pi-tool-display`) and working-message composition with `pi-todo`.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Recheck lifecycle boundaries, attribution, and native file observations against the installed Pi version.

### Lifecycle

[Lifecycle](../src/index.ts):

- [ ] A run lasts from the first `agent_start` to `agent_settled`, through retries, queued follow-ups, and cancellation, and the timer is cleaned up.
- [ ] Direct and nested agent `bash` calls count once per call ID. Manual shell input is excluded.
- [ ] [Milestones](../src/milestones.ts) and [counters](../src/counters.ts) emitted on `pi.events` reach the active run synchronously, and reload removes the old subscriptions.

### Answering models

[Run metadata](../src/index.ts):

- [ ] Assistant `message_end` events name the answering `provider`, `model`, and requested `thinkingLevel`.
- [ ] Under a virtual selection these are the routed physical model. Failed or aborted routing leaves `api: "pi-virtual"` on the message (Pi's unexported `VIRTUAL_MODEL_API`).
- [ ] Error responses don't count.
- [ ] The [stored schema](../src/summary.ts) accepts every host thinking level, missing levels, and missing model lists, and rejects empty lists and models without a provider.

### Throughput

[Output throughput](../src/throughput.ts):

- [ ] Public assistant `message_start` and `message_end` events delimit response streams.
- [ ] `message_update` carries `text_delta`, `thinking_delta`, and `toolcall_delta` events. Text and tool-call deltas can be empty; they must not start the visible-output clock.
- [ ] A completed `message.usage.output` includes reasoning exactly once.
- [ ] Usage from cancelled and failed responses, exclusion of tool and nested usage, aggregation across continuations, and reporting outside the TUI.

### File statistics

- [ ] [Mutation statistics](../src/changes.ts): verified native operations, ordering, path deduplication, net and reverted changes, and unavailable versus zero statistics.

### Persistence and rendering

- [ ] [Persistence and rendering](../src/index.ts): `appendEntry` stays out of model context. Replay, expansion and mouse behaviour, and runs outside the TUI keep metadata without contents or patches.

## Limitations

- **Throughput.** Saved [output throughput](../README.md#output-throughput) is measured by the client, so it depends on when the provider's stream starts and on reported usage. Keep live estimates out of saved summaries. If Pi adds a public timing or throughput API, use it.
- **File coverage.** [Observation skips bash changes, overrides, and custom tools](../README.md#file-changes). Revisit public mutation or run-summary APIs that report trustworthy outcomes and ordering, while keeping bounded retention and saving outside model context. Changes to shared observation belong in libs.
