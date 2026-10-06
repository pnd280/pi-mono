# Pi compatibility for maintainers

[pi-subagents](../README.md)

> Last verified against Pi 1.0.2 on Linux with offline suites and earlier regular and fullscreen terminal checks. Not covered: terminal background waits and abort cards; changes to key-release handling, header space, and live titles; physical mouse and image protocols; macOS; Windows; competing CLI adopters; actual disk exhaustion; live providers.

## Upgrade procedure

1. Run the package checks and [manual checks](testing.md#manual-checks).
2. Compare the installed contracts through the workspace's [Pi API references](../../../../docs/pi-docs.md).
3. Recheck the checklist below and update the verification line. The only Pi prototype patch records late usage ([ADR 0002](adr/0002-count-late-background-usage.md)); recheck its items below.

## Checklist

The backend depends on Pi's public lifecycle and RPC ordering, while task ownership and capacity belong to this package.

### Launch and stop

- [ ] The official subagent example's invocation selection still handles script, compiled-binary, and PATH launches.
- [ ] `--model provider/id`, `--thinking`, `--session`, `--approve`, and `--no-approve` retain their meanings. Unknown providers fail launch; an unlisted ID under a known provider may reach that provider. Invalid thinking levels warn and use Pi's default.
- [ ] `get_state` returns the resolved model and the thinking level clamped to it. Assistant `message_end` events carry the physical `provider`, `model`, and Pi `thinkingLevel` of each response, failed virtual-model routing names the virtual model with `stopReason: "error"`, and `thinking_level_changed` reports later level changes.
- [ ] `new_session` accepts `parentSession`; `set_session_name` names the new session with the task description and rejects blank names; `get_state` returns the full session ID and session-file path. Checkpoint resume uses a newly materialised session file and verifies the concrete session ID and selected ancestry before prompting.
- [ ] `clear_queue` followed by `abort` prevents queued input from continuing. Closing stdin disposes the collectors and RPC event stream, then awaits `session_shutdown`; capture cancellation evidence before EOF.
- [ ] Pi awaits `session_shutdown` for session replacement, reload, and graceful exit. Its SIGTERM handler stops its tracked detached commands.
- [ ] Process depth and logical task identity survive extension reload and session replacement without leaking their environment variables to shell tools.
- [ ] Unix `ps -A -o pid=,ppid=,pgid=` identifies descendants from live handles. SIGSTOP prevents new child launches during discovery; immediate SIGKILL covers detached groups and descendants. Windows uses `taskkill /F /T /PID` without a grace period for navigation and foreground abort. Normal completion and graceful exit retain depth-aware escalation. Cooperative EOF remains necessary after supervisor SIGKILL.

### RPC and results

- [ ] Exported RPC unions match LF-delimited records, optional CR stripping, command IDs, and `extension_ui_response` routing.
- [ ] `prompt` starts a turn when idle, queues input when busy, and reports `disposition: "handled"` for slash commands. Slash commands execute during streaming. A handled command can start model work. It completes without `agent_settled` only when no run has been observed on the connection; observed work must settle before result collection.
- [ ] `agent_settled`, pending command replies, and `disposition: "started"` permit the child to collect a stable final result before closing stdin.
- [ ] Input arriving during `agent_settled` is deferred until its handlers finish. A pending prompt prevents collection from closing stdin; input after closing resumes its captured conversation in a new session.
- [ ] `get_last_assistant_text` and `message_end` distinguish successful text, provider errors, and child-side cancellation. `get_session_stats` exposes cumulative tokens and total cost.
- [ ] Tool-result `usage` contributes once to session totals; `cost.total` is sufficient. `details` stays outside model context.
- [ ] `SessionManager` is exported, and extension imports resolve to the running class in both the Node alias and compiled virtual-module modes.
- [ ] `SessionManager.appendCustomMessageEntry(customType, content, display, details)` persists every custom message, including deferred, `nextTurn`, and settle-boundary messages.
- [ ] `SessionManager.appendUsage(kind, provider, model, usage)` entries count in `getSessionStats()`, the footer, and the cost breakdown, stay out of model context, and are hidden in chat for kinds other than `cache_warm`.
- [ ] Each persisted result emits one custom `message_end` event. Live task totals use its `late_usage` delta because the patch's `appendUsage` call does not emit `entry_appended`.
- [ ] `pi.appendEntry` is persisted and streamed as `entry_appended`. Entries written during `session_start` can precede the RPC subscription, so a live call's streamed provenance identifies the collector generation and authoritative snapshots validate its runtime marker.
- [ ] Before-tree, before-fork, and before-switch hooks invalidate old bindings before teardown. `session_tree` and replacement `session_start` supply the final selected ancestry, including user-entry parent selection. `getBranch()` supplies task recovery data; `get_entries` supports durable entry cursors and supplies the authoritative leaf. Ordinary messages need a snapshot refresh because they do not emit `entry_appended`.

### Extension UI and registration

- [ ] Dynamic registration at `session_start`, `exposure: "model-only"`, and parallel tool execution still work. Hidden registration cannot launch disabled tools through model or codemode calls.
- [ ] Tool renderers receive partial arguments, shared state, expansion state, and streaming results. `renderShell: "self"` leaves the card responsible for its own layout. On reload, Pi rebuilds the chat before `session_start`, so a `registerToolRenderer` resolver supplies the cards of replayed calls until the tool registers again.
- [ ] RPC `select`, `confirm`, `input`, and `editor` requests and replies still map to `ctx.ui`; supported dialog timeouts pass through. Fire-and-forget child UI is dropped.
- [ ] The exported terminal components, theme tokens, and truncation helpers retain their contracts.

## Background and viewer contracts

The offline tests exercise background waits in `agent_end`, slash commands during settle waits, abort and stdin-EOF cleanup, print and JSON settling, and prepared idle RPC context. The [SDK race cases](../validation/abort-races.test.ts) cover completions at abort boundaries, aborts after process exit, and descendant cancellation acknowledgements. Use the manual checks for the TUI path. Recheck these contracts on upgrade:

- [ ] Pi awaits `agent_end` handlers before its post-run processing, and the RPC `agent_end` event is sent only after they finish.
- [ ] The TUI working loader stays visible until `agent_end` handlers finish, and working-message changes apply during that time.
- [ ] `ctx.signal` is live during `agent_end`: RPC `abort` and **Esc** in the TUI abort it, and Pi then settles without `agent_before_settle`.
- [ ] `agent_end` messages carry the assistant `stopReason`, so a supervisor waits only after `stop` or `toolUse` and never blocks retry or compaction.
- [ ] `sendMessage` with `triggerTurn: false` in `agent_before_settle` is flushed into the transcript with custom message events before continuation. Returning `continue: true` keeps the prepared system prompt without running `before_agent_start` again. Pi also flushes these messages when settling after an abort; low-level follow-up queues can remain unconsumed after an abort.
- [ ] `ctx.hasPendingMessages()` counts follow-up and steering input sent through `prompt`, but not messages from `sendMessage()`.
- [ ] Slash commands sent through `prompt` execute while a supervisor waits in `agent_end` or `agent_before_settle`. A child waits in `agent_end` after a normal reply, and in `agent_before_settle` after a final error that Pi does not recover.
- [ ] Terminal execution events precede `agent_end`, which can arrive before settle handlers finish. RPC `abort` can wait for those handlers; capture the checkpoint and close stdin after `agent_end` without waiting for the abort reply. A shared deadline still bounds abort, capture, and shutdown.
- [ ] Print and JSON modes await settle handlers and consume their continuation messages before exiting.
- [ ] In Pi 1.0.2, queuing a `nextTurn` custom message and then sending a user message runs `before_agent_start` in all modes. An idle `sendMessage` with `triggerTurn` skips that hook. The `@pi-mono/utils/idle-wake` helper depends on this; remove it when [Pi issue 5581](https://github.com/earendil-works/pi/issues/5581), open on 5 October 2026, is fixed.
- [ ] `parseSessionEntries` and `SessionManager.inMemory` decode owned entries without modifying foreign session files. Do not substitute `SessionManager.open`.
- [ ] `SessionManager.open` with `appendCustomEntry` appends a transfer receipt to a stopped former supervisor under the shared filesystem lock. The receipt identifies its recipient, supports retry after a recipient append failure, and does not resurrect ownership transferred onwards. This intentional ownership write is separate from all transcript reads.
- [ ] Session projections associate each visible message with its source entry, so `show --last` returns the active conversation's text and cursor. Checkpoint ancestry supplies digest paging, cursors, and cumulative usage; raw append-order entries from abandoned branches are excluded.
- [ ] The exported transcript components, inline and overlay custom UI, widgets, and fullscreen mouse regions support the shared viewer. Regular mode uses `ctx.ui.custom` with `overlay: false` at three-quarters of the terminal height. Fullscreen mode uses a full-terminal overlay. Host remounts preserve the logical task panel and transcript; closing the viewer restores the task list with its view and selection. Panel keys and viewer modes remain local to that presentation.

The build phase 4 cases exercise running input, deferred settle-boundary input, input during exit and resume, live and stopped-owner adoption, and ancestry-scoped digest paging with and without display records. Checkpoint references are versioned and validated; an explicit empty snapshot is distinct from a legacy record without one.
