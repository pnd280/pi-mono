# Pi compatibility for maintainers

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.3.0 on Linux with offline suites and a one-time offline probe of resumed tool loadouts. Not covered: the SDK idle-wake probe; terminal card expansion, resizing, and task-view opening; terminal background waits and abort cards; key-release handling, header space, and live titles; overlay closure while another extension's overlay is open; viewer rows of child tool calls with malformed arguments; physical mouse and image protocols; macOS; Windows; simultaneous [writer-lease](../GLOSSARY.md#history) acquisition; actual disk exhaustion; live providers.

## Upgrade procedure

1. Run the package checks and [manual checks](validation.md).
2. Compare the installed contracts through the workspace's [Pi API references](../../../../docs/pi-docs.md).
3. Recheck the checklist below and update the verification line. The only Pi prototype patch records [late usage](../GLOSSARY.md#results) ([ADR 0002](adr/0002-count-late-background-usage.md)); recheck its items below.

## Checklist

The backend depends on Pi's public lifecycle and RPC ordering, while [task](../GLOSSARY.md#tasks-and-processes) ownership and [capacity](../GLOSSARY.md#tasks-and-processes) belong to this package.

### Launch and stop

- [ ] The official subagent example's invocation selection still handles script, compiled-binary, and PATH launches.
- [ ] `--model provider/id`, `--thinking`, `--session`, `--approve`, and `--no-approve` retain their meanings. Unknown providers fail launch; an unlisted ID under a known provider may reach that provider. Invalid thinking levels warn and use Pi's default. With `--session`, `--model` and `--thinking` replace the selection that Pi restores from the session file.
- [ ] `get_state` returns the resolved model and the thinking level clamped to it. Assistant `message_end` events carry the physical `provider`, `model`, and Pi `thinkingLevel` of each response, failed virtual-model routing names the virtual model with `stopReason: "error"`, and `thinking_level_changed` reports later level changes.
- [ ] `new_session` accepts `parentSession`; `set_session_name` names the new session with the task description and rejects blank names; `get_state` returns the full session ID and session-file path. A new session writes no file until Pi persists the first prompt. Resume opens the task's [child file](../GLOSSARY.md#history) with `--session` and checks its session ID before `begin`.
- [ ] Children receive no `--tools`, so Pi restores a resumed child's tool loadout from its child file instead of the `defaultTools` setting. The package's tools register when the extension loads and again at `session_start` when their exposure, docs, or delivery text changed, and stay active. A recorded tool that the child hides, such as `subagent` at `maxDepth`, stays inactive. The [depth tests](../validation/descendants.test.ts) cover both cases.
- [ ] `clear_queue` followed by `abort` prevents queued input from continuing. Closing stdin disposes the collectors and RPC event stream, then awaits `session_shutdown`; read the final text and statistics before EOF.
- [ ] Pi awaits `session_shutdown` for session replacement, reload, and graceful exit. Its SIGTERM handler stops its tracked detached commands.
- [ ] After `session_shutdown`, Pi loads new extension instances for the replacement or reloaded session, so a revoked [session binding](../GLOSSARY.md#tasks-and-processes) is never opened again.
- [ ] Pi sets up extension shortcuts after `resources_discover`, where lifecycle claims register, so the panel shortcut that the startup handler claims works at once.
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
- [ ] `get_commands` reports the `subagents` command with its extension's `sourceInfo.path`. A file-based extension has an absolute path; a synthetic source, such as an inline extension, names no file. The child receives `-e` only for an absolute source path; otherwise, its settings must load the package. With the same path in settings and `-e`, Pi loads the extension once; another copy of the package stops Pi at startup.
- [ ] An extension command runs at once while the child streams, and Pi defers it while `agent_settled` handlers run. `ctx.ui.setStatus` sends its RPC request before the command's `handled` response. A command that throws still returns `handled`, with an `extension_error` record.
- [ ] Tree navigation to a user or custom message moves the leaf to its parent only when that entry is not the current leaf; navigation to any other entry selects it. Navigation without a summary appends no entry and emits no `session_start`.
- [ ] Cancelling `session_before_tree`, `session_before_fork`, and `session_before_switch` also cancels the RPC `fork` and `new_session` commands and appends nothing.
- [ ] Before-tree, before-fork, and before-switch hooks invalidate old bindings before teardown. After a cancelled change, a cancelled or failed branch summary, or a fork or switch that fails before teardown, Pi emits no session event; the [session binding](../GLOSSARY.md#tasks-and-processes) starts its tasks again at the next interaction. `session_tree` and replacement `session_start` supply the final [selected ancestry](../GLOSSARY.md#history), including user-entry parent selection. `getBranch()` supplies task recovery data; `get_entries` supports durable entry cursors and supplies the authoritative leaf. Ordinary messages need a snapshot refresh because they do not emit `entry_appended`.

### Extension UI and registration

- [ ] Registration in the extension factory activates a `model-only` tool before `session_start` handlers run. Without `--tools`, registering it again with an unchanged exposure replaces its definition and does not activate it again, so active tools that another extension chose earlier in the same `session_start` stay. With `--tools`, any registration activates every registered declarable tool that the list names, so the package skips a registration whose exposure, docs, and delivery text are unchanged. A change to `hidden` removes it from the active tools. Parallel tool execution still works.
- [ ] Hidden registration cannot launch disabled tools through model or codemode calls.
- [ ] Tool renderers receive partial arguments, shared state, expansion state, and streaming results. Pi's default shell draws the box around both slots, with pending, success, and error backgrounds; a renderer's mouse region handles clicks before Pi's expansion toggle. On reload, Pi rebuilds the chat before `session_start`; the tools registered at load supply the cards of replayed calls.
- [ ] RPC `select`, `confirm`, `input`, and `editor` requests and replies still map to `ctx.ui`; supported dialog timeouts pass through. Fire-and-forget child UI is dropped.
- [ ] The exported terminal components, theme tokens, and truncation helpers retain their contracts.

### Background jobs

[Jobs](../GLOSSARY.md#tasks-and-processes) use Pi's public bash tool definition with owned process operations, without overriding `bash`.

[ADR 0005](adr/0005-background-jobs.md) defines the tool and delivery contracts; [ADR 0007](adr/0007-own-job-processes-and-bound-logs.md) defines process ownership and bounded logs.

- [ ] `createBashToolDefinition(cwd, { operations, commandPrefix })` and `getShellConfig(shellPath)` remain public exports. The job wrapper must supply the command prefix and resolved shell path explicitly; these APIs do not read the user's settings.
- [ ] The tool's `execute` reads `command` and `timeout` and ignores its tool-call ID. It passes `exec` the prefixed command, working directory, abort signal, timeout in seconds, and the session and model environment from the supplied tool context.
- [ ] The tool maps operations errors `aborted` and `timeout:N` to `Command aborted` and `Command timed out after N seconds`. Jobs classify these terminal status lines before a later abort during group cleanup.
- [ ] The tool resolves `structuredContent.exit_code` from the exit code returned by the operations, including non-zero codes. A null exit code is a failure. The owned runner converts a signal-stopped shell to `128 + signal`.
- [ ] `getShellConfig(shellPath)` returns `shell`, `args`, and optional `commandTransport`; the runner supports command arguments and stdin transport. `pi.getSettings()` returns the raw `shellPath` and `shellCommandPrefix` settings. Pi's settings manager expands `~` and `file://` in `shellPath` and converts Git Bash, MSYS, Cygwin, and WSL drive paths on Windows; `shellOptions` in [jobs](../src/jobs/registry.ts) copies these rules. Pi passes `shellCommandPrefix` unchanged.
- [ ] Pi's tracked-children cleanup does not cover the owned job operations. The registry's synchronous Node `exit` hook covers Pi exits that skip `session_shutdown`, and stays active until group cleanup ends. No private Pi tracker API is imported.
- [ ] Job output stays in the owned bounded writer and result tail, without entering Pi's `onData` accumulator and creating a second full-output log.
- [ ] `pi.getAllTools()` returns `sourceInfo.source === "builtin"` for Pi's own `bash`, and another source when an extension registers `bash`.
- [ ] `DEFAULT_MAX_LINES`, `DEFAULT_MAX_BYTES`, and `truncateTail` keep the 2,000-line and 50 KiB tail limits of job results and log reads.

## Background and viewer contracts

The offline tests exercise background waits in `agent_end`, slash commands during settle waits, abort and stdin-EOF cleanup, print and JSON settling, and prepared idle RPC context. The [SDK race cases](../validation/abort-races.test.ts) cover background results at abort boundaries, aborts after process exit, and descendant cancellation acknowledgements. Use the [manual checks](validation.md) for the TUI path. Recheck these contracts on upgrade:

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
- [ ] The [child-file reader](../src/history/sessions.ts) parses complete nonblank JSON lines strictly in memory. It rejects invalid UTF-8, malformed JSON, invalid headers or entry structure, duplicate entry IDs, and a non-null parent ID that does not name an earlier entry. It ignores bytes after the last LF before decoding, including a partial final UTF-8 character, and never modifies the file. Pi owns the entry payloads, which the reader retains unchanged. Do not substitute Pi's permissive `parseSessionEntries` helper or `SessionManager.open`: in Pi 1.3.0, the loader appends a newline to a file that ends with a partial line.
- [ ] Pi runs no tool call of an assistant response with `stopReason: "error"` or `"aborted"`. The resume warning ignores these calls, and the viewer shows the response's error for them.
- [ ] Session projections associate each visible message with its source entry, so `show --last` returns the active conversation's text and cursor. The child file's ancestry of the selected run supplies digest paging, cursors, and cumulative usage; raw append-order entries from abandoned branches are excluded.
- [ ] After an abort during a tool call, Pi adds an empty assistant message with `stopReason: "error"` (observed in Pi 1.0.2, 1.2.0, and 1.3.0). The [last-text test](../validation/show.test.ts) confirms that Pi adds this message, because without it the skip has no coverage.
- [ ] JSON `message_start`, `message_update`, and `message_end` events, with `assistantMessageEvent` content indices and tool-call deltas that `parseStreamingJson` reads, rebuild a streaming assistant message. Execution events carry the `toolCallId` of a call in that message.
- [ ] The exported chat components, `ToolExecutionComponent`, and the individual built-in `create*ToolDefinition` renderers support the viewer. Without `setArgsComplete`, those renderers read no files, as in Pi's own history.
- [ ] Inline and overlay custom UI, widgets, and fullscreen mouse regions support the viewer. Regular mode uses `ctx.ui.custom` with `overlay: false` at three-quarters of the terminal height. Fullscreen mode uses a full-terminal overlay. Host remounts preserve the logical task panel and transcript; closing the viewer restores the task list with its view and selection. Panel keys and expansion remain local to that presentation.

The [input cases](../validation/input.test.ts) exercise running input, deferred settle-boundary input, input during exit and resume, and owner-only resume of inactive descendants. The [digest cases](../validation/show.test.ts) exercise ancestry-scoped paging.

## Replacement opportunities

Pi 1.3.0 exposes no extension API for writing usage entries in the current session and does not count usage on custom messages. The `SessionManager.prototype.appendCustomMessageEntry` wrapper supplies [late usage](../GLOSSARY.md#results) in session totals, the footer, the cost breakdown, and nested supervisors' run usage ([ADR 0002](adr/0002-count-late-background-usage.md)). A public replacement must write usage at custom-message persistence or count usage on custom messages.
