# Background subagent delivery and Pi settlement

This document records the discussion about using Pi lifecycle events to deliver background subagent results without taking the idle-start path affected by [Pi issue #5581](https://github.com/earendil-works/pi/issues/5581).

The discussion examined Pi 1.0.2 and the workspace's `pi-subagents` implementation. No runtime code was changed, and no end-to-end experiment or application test was run. The final recommendation is a candidate for verification, not an approved implementation plan.

## Goal and constraints

The user proposed keeping the supervisor's current run active while unfinished background subagents remain. Waiting must cause no model requests or tool calls. When a result becomes available, the supervisor should receive it and continue with its prepared prompt.

The intended behaviour is:

1. Wait only when the supervisor is about to settle and at least one background subagent remains unfinished.
2. Release the wait when any background subagent finishes. Do not wait for every task.
3. Deliver the available results and let the supervisor continue.
4. Allow ordinary user prompts to remain queued while the run is active. The user explicitly accepted this behaviour.
5. Release the wait on supervisor abort without cancelling background tasks.
6. Deliver results that arrive after the supervisor has become idle.

The package must use public Pi APIs and RPC. Keyboard interception was explicitly rejected as a way to detect cancellation.

## Relevant Pi events

| Event                 | Role in this discussion                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turn_end`            | One assistant turn, including its tool results, has finished. Handlers can return entry drafts and request continuation.                                |
| `agent_end`           | The low-level agent loop has ended. Its handlers are still awaited before the low-level run is cleaned up. Recovery and queued continuation can follow. |
| `agent_before_settle` | Automatic post-run work has been processed. An extension can still append entries and request continuation before final settlement.                     |
| `agent_settled`       | Automatic work has finished. This event is notification-only.                                                                                           |

### How an asynchronous wait works

Pi awaits an asynchronous `agent_before_settle` handler. While its promise remains pending, Pi starts no further model request through that run, and `agent_settled` has not fired.

Returning `{ continue: false }` does not create a wait. The pending promise creates it. That return value also does not cancel queued messages.

A handler can return `custom`, `custom_message`, `context_edit`, or `compaction` entry drafts. Returning `entries` replaces the proposed draft list, so a handler that adds drafts should preserve `...event.entries`.

Returning `continue: true` requires runnable context. After a final assistant response, a `custom_message` can supply the new input. Continuation can lead to another settlement attempt, so continuation conditions must prevent an endless loop.

## Issue #5581 and prompt preparation

Issue #5581 was open when checked during the discussion. An idle custom message sent with `triggerTurn: true` starts a run through a path that bypasses `before_agent_start`. Extensions that prepare the system prompt or tools in that hook can therefore be skipped.

Keeping the current prepared run active avoids that idle-start path. Pi retains the run-specific system prompt options while processing its continuation cycle and clears them when that cycle finishes.

This does not run `before_agent_start` again for each result. It preserves the preparation from the existing run. It also does not solve every case in the upstream issue, such as a custom-message-driven first run in a fresh session.

## Existing package behaviour

[`Delivery`](../packages/extensions/pi-subagents/src/delivery.ts) already uses settlement waiting for nested supervisors and for top-level print and JSON modes. Top-level TUI and RPC supervisors are excluded by the mode/depth condition in `Delivery.settle()`.

The current implementation:

- Waits for all direct background tasks with `Promise.all()`.
- Collects completion messages while settlement waiting is active.
- Returns those messages as `custom_message` drafts with `continue: true`.
- Sends completion messages as follow-ups when the supervisor is active outside that wait.
- Uses `wakeIdle()` when the supervisor is idle.

[`src/index.ts`](../packages/extensions/pi-subagents/src/index.ts) connects `Delivery.settle()` to `agent_before_settle` and preserves drafts from earlier handlers.

The current completion rules serve different needs:

- A child supervisor must consume its descendants' results before returning to its parent.
- Print and JSON supervisors must consume results before exiting.
- A top-level TUI can remain open while idle and accept another user turn before background work finishes.

These are the observable design differences. The discussion did not establish the original author's rationale for the mode restriction.

### Existing idle delivery workaround

[`wakeIdle()`](../packages/utils/src/idle-wake.ts) queues custom messages with `deliverAs: "nextTurn"`, then calls `sendUserMessage()` in the same synchronous block. This goes through normal prompt preparation, including `before_agent_start`.

The cost is an additional synthetic user message in the transcript. This path remains relevant after a supervisor abort because background tasks survive that abort, and an explicit abort can bypass `agent_before_settle`.

## Corrections made during the discussion

The initial assessment raised three objections to enabling the existing settlement wait in top-level TUI: completed results would wait for the slowest task, ordinary input would remain queued, and abort would not resolve the pending promise.

The user clarified that the proposed design differs from the current `Promise.all()` implementation:

- The first background completion releases the wait, so fast results do not wait for slower tasks.
- Queued user input is expected while the supervisor run remains active.

Those first two objections therefore do not apply to the proposed design.

The assistant then suggested detecting Escape through `ctx.ui.onTerminalInput()` and releasing a local cancellation promise. The user rejected keyboard input handling as an unconventional cancellation mechanism. The assistant withdrew that suggestion. It is not part of the recommendation.

## Cancellation finding

Pi 1.0.2 has two relevant lifetimes: the low-level agent run and the surrounding session run that includes post-run processing.

At `agent_before_settle`:

- The session still reports an active run.
- The low-level run has already cleared its active state.
- `ctx.signal`, which reads the low-level agent signal, is `undefined`.
- A session abort sets internal flags that prevent continuation, but it does not resolve an extension's pending promise.

`ctx.abort()` requests cancellation. It does not subscribe to cancellation requested elsewhere. No general public abort notification was identified for a handler waiting at this boundary.

The unresolved issue is observing abort while waiting. It is not the mechanics of racing completion against a cancellation promise. Keyboard input would observe only one possible source of abort and would duplicate input handling.

## Workarounds considered

### 1. Move the wait to `agent_end`

This was the final recommended candidate.

Source inspection showed that Pi 1.0.2 awaits `agent_end` handlers while the low-level active run still exists. `ctx.signal` remains live during that handler, so the wait can use conventional abort handling.

The proposed flow is:

1. After normal completion, check whether unfinished background tasks remain.
2. Wait for the first background completion or for `ctx.signal` to abort.
3. On completion, queue available results with `pi.sendMessage(..., { deliverAs: "followUp" })`.
4. Return from the handler. Pi processes queued results before becoming idle, retaining the existing prepared prompt.
5. On abort, release the wait without cancelling background tasks or discarding undelivered results.

`agent_end` does not accept the boundary return contract used by `agent_before_settle`. Delivery would use queued messages, not returned entry drafts with `continue: true`.

**Constraint:** This event precedes automatic recovery. The wait should be skipped for failed, aborted, or length-truncated attempts so retries and recovery can proceed.

This approach was supported by source inspection only. Its integration with child result collection, cancellation, and exactly-once delivery was not tested.

### 2. Move the wait to `turn_end`

`turn_end` also runs while `ctx.signal` is live. It supports returning `custom_message` drafts and `continue: true` directly.

The proposed wait would apply only after a normal final assistant response, with unfinished background tasks and no known continuation already pending.

**Constraint:** The event fires after every turn. Selecting the correct turn requires more checks, and later extension handlers can still request continuation. `agent_end` is a simpler match for waiting after the loop finishes its immediate work.

### 3. Keep `wakeIdle()`

Allow the supervisor to settle, then use the existing prepared idle-start workaround when a result arrives.

**Constraint:** The transcript contains an extra user message. This approach avoids holding a run open and already exists in the package.

## Final position and remaining verification

The final recommendation was to investigate an abort-aware, first-completion wait in `agent_end`, while retaining `wakeIdle()` for results arriving after the supervisor becomes idle.

The user has not requested or approved an implementation. Remaining verification includes:

- Confirm that a first completion releases the wait while slower tasks continue.
- Confirm that host abort requests release the wait through `ctx.signal` without keyboard interception.
- Confirm that background tasks survive supervisor abort and their results remain deliverable.
- Confirm that result delivery retains the prepared prompt and occurs exactly once.
- Confirm that queued input, recovery, child collection, and shutdown retain their required ordering.

These are open checks, not claims of passing coverage or an instruction to add new tests. New invariants and tests require user approval under the package's testing policy.

## Evidence consulted

The discussion read the issue body and comments, the installed Pi 1.0.2 documentation and implementation, and these workspace files:

- [`pi-subagents` instructions](../packages/extensions/pi-subagents/AGENTS.md), [README](../packages/extensions/pi-subagents/README.md), [compatibility checklist](../packages/extensions/pi-subagents/docs/pi-compatibility.md), and [coverage guide](../packages/extensions/pi-subagents/docs/testing.md).
- [`src/delivery.ts`](../packages/extensions/pi-subagents/src/delivery.ts), [`src/index.ts`](../packages/extensions/pi-subagents/src/index.ts), and [`src/tasks.ts`](../packages/extensions/pi-subagents/src/tasks.ts).
- [`validation/background.test.ts`](../packages/extensions/pi-subagents/validation/background.test.ts) and [`validation/provider.ts`](../packages/extensions/pi-subagents/validation/provider.ts).
- [`packages/utils/src/idle-wake.ts`](../packages/utils/src/idle-wake.ts).

Installed Pi source inspection covered extension event dispatch, session prompt preparation and continuation, custom-message delivery, session abort, and the low-level agent's signal lifetime. Existing tests were read for context but were not executed.
