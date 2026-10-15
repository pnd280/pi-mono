# Pi compatibility for maintainers

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.2.0 on Linux with offline suites, a source comparison with Pi 1.0.2, and a one-time SDK probe of the idle wake. Not covered: terminal checks, which last passed on Pi 1.0.2 for card expansion, resizing, and task-view opening; terminal background waits and abort cards; changes to key-release handling, header space, and live titles; physical mouse and image protocols; macOS; Windows; competing [supervisors](../GLOSSARY.md#tasks-and-processes) that resume one [task](../GLOSSARY.md#tasks-and-processes); actual disk exhaustion; live providers.

## Upgrade procedure

1. Run the package checks and [manual checks](testing.md#manual-checks).
2. Compare the installed contracts through the workspace's [Pi API references](../../../../docs/pi-docs.md).
3. Recheck the checklist below and update the verification line. The only Pi prototype patch records [late usage](../GLOSSARY.md#results) ([ADR 0002](adr/0002-count-late-background-usage.md)); recheck its items below.

## Checklist

The backend depends on Pi's public lifecycle and RPC ordering, while task ownership and [capacity](../GLOSSARY.md#tasks-and-processes) belong to this package.

### Launch and stop

- [ ] The official subagent example's invocation selection still handles script, compiled-binary, and PATH launches.
- [ ] `--model provider/id`, `--thinking`, `--session`, `--approve`, and `--no-approve` retain their meanings. Unknown providers fail launch; an unlisted ID under a known provider may reach that provider. Invalid thinking levels warn and use Pi's default. With `--session`, `--model` and `--thinking` replace the selection that Pi restores from the session file.
- [ ] `get_state` returns the resolved model and the thinking level clamped to it. Assistant `message_end` events carry the physical `provider`, `model`, and Pi `thinkingLevel` of each response, failed virtual-model routing names the virtual model with `stopReason: "error"`, and `thinking_level_changed` reports later level changes.
- [ ] `new_session` accepts `parentSession`; `set_session_name` names the new session with the task description and rejects blank names; `get_state` returns the full session ID and session-file path. A new session writes no file until Pi persists the first prompt. Resume opens the task's [child file](../GLOSSARY.md#history) with `--session` and checks its session ID before `begin`.
- [ ] `clear_queue` followed by `abort` prevents queued input from continuing. Closing stdin disposes the collectors and RPC event stream, then awaits `session_shutdown`; read the final text and statistics before EOF.
- [ ] Pi awaits `session_shutdown` for session replacement, reload, and graceful exit. Its SIGTERM handler stops its tracked detached commands.
- [ ] Process depth and logical task identity survive extension reload and session replacement without leaking their environment variables to shell tools.
- [ ] Unix `ps -A -o pid=,ppid=,pgid=` identifies [descendants](../GLOSSARY.md#tasks-and-processes) from live handles. SIGSTOP prevents new child launches during discovery; immediate SIGKILL covers detached groups and descendants. Windows uses `taskkill /F /T /PID` without a grace period for navigation and foreground abort. Normal completion and graceful exit retain depth-aware escalation. Cooperative EOF remains necessary after supervisor SIGKILL.

### RPC and results

- [ ] Exported RPC unions match LF-delimited records, optional CR stripping, command IDs, and `extension_ui_response` routing.
- [ ] `prompt` starts a turn when idle, queues input when busy, and reports `disposition: "handled"` for slash commands. Slash commands execute during streaming. A handled command can start model work. It completes without `agent_settled` only when no run has been observed on the connection; observed work must settle before result collection.
- [ ] `agent_settled`, pending command replies, and `disposition: "started"` permit the child to collect a stable final result before closing stdin.
- [ ] Input arriving during `agent_settled` is deferred until its handlers finish. A pending prompt prevents collection from closing stdin; input after closing resumes the task in its child file.
- [ ] `get_last_assistant_text` and `message_end` distinguish successful text, provider errors, and child-side cancellation. `get_session_stats` exposes cumulative tokens and total cost for every entry in the session file, including earlier runs and abandoned branches. A baseline read after `begin` gives each run's usage.
- [ ] When a run takes a prompt, steering, or follow-up message, Pi emits its user `message_end` after the `message_end` of the reply that it follows. Background results use the `custom` role, so they do not keep the child's earlier reply in its result.
- [ ] Tool-result `usage` contributes once to session totals; `cost.total` is sufficient. `details` stays outside model context.
- [ ] `SessionManager` is exported, and extension imports resolve to the running class in both the Node alias and compiled virtual-module modes.
- [ ] `SessionManager.appendCustomMessageEntry(customType, content, display, details)` persists every custom message, including deferred, `nextTurn`, and settle-boundary messages.
- [ ] `SessionManager.appendUsage(kind, provider, model, usage)` entries count in `getSessionStats()`, the footer, and the cost breakdown, stay out of model context, and are hidden in chat for kinds other than `cache_warm`.
- [ ] Each persisted result emits one custom `message_end` event. Live task totals use its `late_usage` delta because the patch's `appendUsage` call does not emit `entry_appended`.
- [ ] `pi.appendEntry` is persisted and streamed as `entry_appended`. Session listeners receive the final `message_end` after extension middleware and before Pi saves the assistant message.
- [ ] `get_commands` reports the `subagents` command with the absolute source path of its extension. With the same path in settings and `-e`, Pi loads the extension once; another copy of the package stops Pi at startup.
- [ ] An extension command runs at once while the child streams, and Pi defers it while `agent_settled` handlers run. `ctx.ui.setStatus` sends its RPC request before the command's `handled` response. A command that throws still returns `handled`, with an `extension_error` record.
- [ ] Tree navigation to a user or custom message moves the leaf to its parent only when that entry is not the current leaf; navigation to any other entry selects it. Navigation without a summary appends no entry and emits no `session_start`.
- [ ] Cancelling `session_before_tree`, `session_before_fork`, and `session_before_switch` also cancels the RPC `fork` and `new_session` commands and appends nothing.
- [ ] Before-tree, before-fork, and before-switch hooks invalidate old bindings before teardown. `session_tree` and replacement `session_start` supply the final [selected ancestry](../GLOSSARY.md#history), including user-entry parent selection. `getBranch()` supplies task recovery data; `get_entries` supports durable entry cursors and supplies the authoritative leaf. Ordinary messages need a snapshot refresh because they do not emit `entry_appended`.

### Extension UI and registration

- [ ] Dynamic registration at `session_start`, `exposure: "model-only"`, and parallel tool execution still work. Hidden registration cannot launch disabled tools through model or codemode calls.
- [ ] Tool renderers receive partial arguments, shared state, expansion state, and streaming results. Pi's default shell draws the box around both slots, with pending, success, and error backgrounds; a renderer's mouse region handles clicks before Pi's expansion toggle. On reload, Pi rebuilds the chat before `session_start`, so a `registerToolRenderer` resolver supplies the cards of replayed calls until the tool registers again.
- [ ] RPC `select`, `confirm`, `input`, and `editor` requests and replies still map to `ctx.ui`; supported dialog timeouts pass through. Fire-and-forget child UI is dropped.
- [ ] The exported terminal components, theme tokens, and truncation helpers retain their contracts.

### Background jobs

[Jobs](../GLOSSARY.md#tasks-and-processes) use Pi's public bash tool without overriding `bash`. See [ADR 0005](adr/0005-background-jobs.md).

- [ ] `createBashToolDefinition(cwd, { operations, commandPrefix })` and `createLocalBashOperations({ shellPath })` are exported. Without `commandPrefix`, and without `shellPath` in the operations, the tool ignores the user's settings.
- [ ] The tool's `execute` reads only `command` and `timeout` (in seconds) and ignores its tool-call ID. It resolves with `structuredContent.exit_code`. It throws `Command aborted` at an abort and `Command timed out after N seconds` at a timeout; the error text holds the partial output. A null exit code is a failure.
- [ ] Local bash operations give every output chunk to `onData`, spawn the shell detached in its own process group, and kill that group at an abort or a timeout. A signal-stopped shell reports `128 + signal`. Pi's exit cleanup stops the tracked commands. With the tool context that `job` passes, the command gets the session and model environment variables of Pi's own `bash`.
- [ ] `getShellConfig(shellPath)` selects the shell from the resolved `shellPath`. `pi.getSettings()` returns the raw `shellPath` and `shellCommandPrefix` settings. Pi's settings manager expands `~` and `file://` in `shellPath` and converts Git Bash, MSYS, Cygwin, and WSL drive paths on Windows; `shellOptions` in [jobs](../src/jobs/registry.ts) copies these rules. Pi passes `shellCommandPrefix` unchanged.
- [ ] `pi.getAllTools()` returns `sourceInfo.source === "builtin"` for Pi's own `bash`, and another source when an extension registers `bash`.
- [ ] `DEFAULT_MAX_LINES`, `DEFAULT_MAX_BYTES`, and `truncateTail` keep the 2,000-line and 50 KiB tail limits of job results and log reads.

## Background and viewer contracts

The offline tests exercise background waits in `agent_end`, slash commands during settle waits, abort and stdin-EOF cleanup, print and JSON settling, and prepared idle RPC context. The [SDK race cases](../validation/abort-races.test.ts) cover background results at abort boundaries, aborts after process exit, and descendant cancellation acknowledgements. Use the manual checks for the TUI path. Recheck these contracts on upgrade:

- [ ] Pi awaits `agent_end` handlers before its post-run processing, and the RPC `agent_end` event is sent only after they finish.
- [ ] The TUI working loader stays visible until `agent_end` handlers finish, and working-message changes apply during that time.
- [ ] `ctx.signal` is live during `agent_end`: RPC `abort` and **Esc** in the TUI abort it, and Pi then settles without `agent_before_settle`.
- [ ] `agent_end` messages carry the assistant `stopReason`, so a supervisor waits only after `stop` or `toolUse` and never blocks retry or compaction.
- [ ] `sendMessage` with `triggerTurn: false` in `agent_before_settle` is flushed into the transcript with custom message events before continuation. Returning `continue: true` keeps the prepared system prompt without running `before_agent_start` again. Pi also flushes these messages when settling after an abort; low-level follow-up queues can remain unconsumed after an abort.
- [ ] `sendMessage` with `triggerTurn: false` in `turn_end` is saved with custom message events after the `turn_end` handlers finish, also when an abort follows, and the next model request includes it. [Delivery](../src/delivery.ts) uses this for `resultDelivery: "turn_end"` ([ADR 0006](adr/0006-deliver-background-results-at-turn-end.md)).
- [ ] Returning `continue: true` from `turn_end` requests one more model response. Tool calls or queued input that already need a request satisfy it, so it adds no second request.
- [ ] `ctx.hasPendingMessages()` counts follow-up and steering input sent through `prompt`, but not messages from `sendMessage()`.
- [ ] Slash commands sent through `prompt` execute while a supervisor waits in `agent_end` or `agent_before_settle`. A child waits in `agent_end` after a normal reply, and in `agent_before_settle` after a final error that Pi does not recover.
- [ ] Terminal execution events precede `agent_end`, which can arrive before settle handlers finish. RPC `abort` can wait for those handlers; read the final statistics and close stdin after `agent_end` without waiting for the abort reply. A shared deadline still bounds abort, the statistics read, and shutdown.
- [ ] Print and JSON modes await settle handlers and consume their continuation messages before exiting.
- [ ] An idle `sendMessage` with `triggerTurn` runs `before_agent_start` with `messageType: "custom"` and adds pending `nextTurn` messages after its starting message, in one run, in all modes. The session is busy when the call returns. In an `agent_settled` handler, Pi starts the run after the handlers finish. The idle wake in [delivery](../src/delivery.ts) depends on this. Pi 1.0.2 skipped the hook for such runs ([Pi issue 5581](https://github.com/earendil-works/pi/issues/5581)), so the wake then sent an extra user message.
- [ ] `parseSessionEntries` decodes child session files read into memory, without modifying them. Do not substitute `SessionManager.open`: Pi's loader appends a newline to a file that ends with a partial line.
- [ ] Pi runs no tool call of an assistant response with `stopReason: "error"` or `"aborted"`. The resume warning ignores these calls, and the viewer shows the response's error for them.
- [ ] Session projections associate each visible message with its source entry, so `show --last` returns the active conversation's text and cursor. The child file's ancestry of the selected run supplies digest paging, cursors, and cumulative usage; raw append-order entries from abandoned branches are excluded.
- [ ] JSON `message_start`, `message_update`, and `message_end` events, with `assistantMessageEvent` content indices and tool-call deltas that `parseStreamingJson` reads, rebuild a streaming assistant message. Execution events carry the `toolCallId` of a call in that message.
- [ ] The exported chat components, `ToolExecutionComponent`, and the individual built-in `create*ToolDefinition` renderers support the viewer. Without `setArgsComplete`, those renderers read no files, as in Pi's own history.
- [ ] Inline and overlay custom UI, widgets, and fullscreen mouse regions support the viewer. Regular mode uses `ctx.ui.custom` with `overlay: false` at three-quarters of the terminal height. Fullscreen mode uses a full-terminal overlay. Host remounts preserve the logical task panel and transcript; closing the viewer restores the task list with its view and selection. Panel keys and expansion remain local to that presentation.

The [input and digest cases](testing.md#input-and-transcript-digests) exercise running input, deferred settle-boundary input, input during exit and resume, owner-only resume of inactive descendants, and ancestry-scoped digest paging.

## Replacement opportunities

Pi 1.2.0 has no public API that replaces the only private hook. Extensions still cannot write usage entries, and Pi does not count usage on custom messages.

| Private hook                                                                                                      | Features that depend on it                                                                                                | Parity | Public API Pi would need                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `SessionManager.prototype.appendCustomMessageEntry` wrapper ([ADR 0002](adr/0002-count-late-background-usage.md)) | [Late usage](../GLOSSARY.md#results) in session totals, the footer, the cost breakdown, and nested supervisors' run usage | None   | A usage writer at custom-message persistence, or usage counted on custom messages |
