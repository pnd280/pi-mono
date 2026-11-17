# Pi compatibility for maintainers

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.5.2 with offline suites on Linux and a source review of the Pi 1.5.1 to 1.5.2 changes. Not covered: the [ADR 0003 runtime probe](adr/0003-keep-task-history-in-child-sessions.md#runtime-checks), which last ran on Pi 1.0.2; the offline probe of resumed tool loadouts, which last ran on Pi 1.3.0; the SDK idle-wake probe; terminal card expansion, resizing, and task-view opening; terminal background waits and abort cards; key-release handling, header space, and live titles; overlay closure while another extension's overlay is open; viewer rows of child tool calls with malformed arguments; physical mouse and image protocols; macOS; Windows; simultaneous [writer-lease](../GLOSSARY.md#history) acquisition; actual disk exhaustion; a child's idle cache warming; live providers.

## Upgrade procedure

1. Run the [manual checks](validation.md).
2. Compare the installed contracts through the workspace's [Pi API references](../../../../docs/agents/pi-docs.md).
3. Recheck the checklist below, and update the verification line and the limitations.

## Checklist

The child-process backend depends on Pi's public lifecycle and RPC ordering, while [task](../GLOSSARY.md#tasks-and-processes) ownership and [capacity](../GLOSSARY.md#tasks-and-processes) belong to this package.

### Launch and stop

- [ ] The official subagent example's invocation selection still handles script, compiled-binary, and PATH launches.
- [ ] `--model provider/id` selects that model.
- [ ] `--thinking` sets the thinking level.
- [ ] `--session` opens the named session file.
- [ ] `--approve` trusts project-local files for the run, and `--no-approve` ignores them.
- [ ] When `--mode`, `--approve`, or `--no-approve` appears again later in the arguments, the later flag applies, so the extension's flags apply over the same flags in [launch arguments](tasks.md#launch-arguments).
- [ ] After `--`, Pi reads an argument that starts with `@` as a file input and every other argument as a message. The [launch-argument check](tasks.md#launch-arguments) rejects `--`, so that the extension's trust flag applies.
- [ ] Pi still resolves a relative value of `--extension`, `-e`, `--skill`, `--prompt-template`, and `--theme` from the working directory, and converts a `file://` value to an absolute path. Its package manager still reads the prefixes in `REMOTE_SOURCE` in [tool-schema.ts](../src/tasks/tool-schema.ts) as built-in, npm, or git sources: compare them with `parseSource`.
- [ ] Pi still reads the value of `--system-prompt` and `--append-system-prompt` from a file of that name relative to the working directory when one exists, so [templates](tasks.md#templates) reject these flags.
- [ ] Pi opens a `--session` file in the working directory of its header, so the [resume check](history.md#resume) compares that directory with the supervisor's.
- [ ] `VALUE_FLAGS` in [tool-schema.ts](../src/tasks/tool-schema.ts) still lists each Pi flag that always takes the next argument, whatever it is (`args[++i]` in Pi's `dist/cli/args.js`), apart from the flags that other parameters own. No other flag, including an unknown flag, takes a next `--mode`.
- [ ] An unmatched `--model provider/id` value with an unrecognised provider prefix fails the launch. The whole value can instead match a catalogue ID under another provider.
- [ ] An unlisted model ID under a known provider can reach that provider.
- [ ] An invalid `--thinking` value gives a warning and is ignored.
- [ ] With `--session`, `--model` and `--thinking` replace the selection that Pi restores from the session file.
- [ ] `get_state` returns the resolved model and the thinking level clamped to it.
- [ ] Provider-stream assistant `message_end` events carry the physical `provider`, `model`, and Pi `thinkingLevel`. Synthetic failure events name the selected model and can omit `thinkingLevel`.
- [ ] Failed virtual-model routing gives an assistant `message_end` that names the virtual model with `stopReason: "error"`.
- [ ] `thinking_level_changed` reports later changes of the thinking level.
- [ ] `new_session` accepts `parentSession`.
- [ ] `set_session_name` names the new session with the task description and rejects blank names.
- [ ] `get_state` returns the full session ID and session-file path.
- [ ] A new session writes no file until Pi persists the first prompt.
- [ ] Without a `--tools` list that replaces the defaults, and without `--no-tools` or `--no-builtin-tools`, Pi restores a resumed session's tool loadout from its session file instead of the `defaultTools` setting.
- [ ] Without a `--tools` list that replaces the defaults, and without `--no-tools` or `--no-builtin-tools`, a resumed child also turns on registered `direct` and `model-only` tools that no system message of the child file adds or removes, unless `defaultActive: false`.
- [ ] A `--tools` list of `+`/`-` modifiers restores the recorded loadout and then applies the modifiers.
- [ ] A recorded tool that an extension registers as `hidden`, such as `subagent` at `maxDepth`, stays inactive after resume.
- [ ] `clear_queue` clears pending steering and follow-up input before `abort`. Prompts deferred during `agent_settled` remain scheduled after its handlers finish.
- [ ] Closing stdin disposes the collectors and RPC event stream, then awaits `session_shutdown`.
- [ ] Pi awaits `session_shutdown` for session replacement, reload, and graceful exit.
- [ ] On stdin EOF and graceful exit, Pi aborts the active run and waits until it settles before `session_shutdown`.
- [ ] Pi's SIGTERM handler stops its tracked detached commands.
- [ ] RPC mode does not exit on the first SIGTERM that arrives while it shuts down.
- [ ] After `session_shutdown`, Pi loads new extension instances for the replacement or reloaded session.
- [ ] Pi sets up extension shortcuts after `resources_discover`, where lifecycle claims register.
- [ ] Process depth and logical task identity survive extension reload and session replacement.
- [ ] The environment variables for process depth and logical task identity do not reach shell tools.
- [ ] Unix `ps -A -o pid=,ppid=,pgid=` identifies [descendants](../GLOSSARY.md#tasks-and-processes) from live handles.
- [ ] SIGSTOP prevents new child launches during process discovery.
- [ ] Immediate SIGKILL stops detached groups and descendants.
- [ ] On Windows, `taskkill /F /T /PID` stops the process tree without a grace period for navigation and foreground abort.

Resume opens the task's [child file](../GLOSSARY.md#history) with `--session` and checks its session ID before `begin`.

The [depth tests](../validation/descendants.test.ts) cover the active and the hidden case.

The supervisor reads the final text and statistics before stdin EOF. Because Pi loads new extension instances after `session_shutdown`, a revoked [session binding](../GLOSSARY.md#tasks-and-processes) is never opened again. Because shortcuts are set up after `resources_discover`, the panel shortcut that the startup handler claims works at once.

Normal completion and graceful exit retain depth-aware escalation. Cooperative EOF remains necessary after supervisor SIGKILL. After stdin EOF during a run, a child writes the abort's entries to its [child file](../GLOSSARY.md#history) before its shutdown handlers run, so the file can change once after supervisor SIGKILL.

Pi's abort before `session_shutdown` sets how a foreground task stops when its supervisor exits during a run; see [immediate stop](shutdown.md#immediate-stop). Pi's SIGTERM handling during shutdown sets how a child that blocks its shutdown ends; see [process-group cleanup](shutdown.md#process-group-cleanup).

### RPC and results

- [ ] Exported RPC unions match LF-delimited records, optional CR stripping, command IDs, and `extension_ui_response` routing.
- [ ] `prompt` starts a turn when the session is idle.
- [ ] During an active run, `prompt` queues input when `streamingBehavior` is supplied.
- [ ] `prompt` reports `disposition: "handled"` for slash commands.
- [ ] Slash commands execute during streaming.
- [ ] A handled command completes without `agent_settled` only when no run has been observed on the connection.
- [ ] `agent_settled`, pending command replies, and `disposition: "started"` let the child collect a stable final result before stdin closes.
- [ ] Pi defers input that arrives during `agent_settled` until its handlers finish.
- [ ] `get_last_assistant_text` and `message_end` distinguish successful text, provider errors, and child-side cancellation.
- [ ] `get_session_stats` returns cumulative tokens and total cost for every entry in the session file, including earlier runs and abandoned branches.
- [ ] When a run takes a prompt, steering, or follow-up message, Pi emits its user `message_end` after the `message_end` of the reply that it follows.
- [ ] Tool-result `usage` contributes once to session totals, and `cost.total` is sufficient.
- [ ] Tool-result `details` stays outside model context.
- [ ] `SessionManager` is exported, and extension imports resolve to the running class in both the Node alias and compiled virtual-module modes.
- [ ] `SessionManager.appendCustomMessageEntry(customType, content, display, details)` persists every custom message, including deferred, `nextTurn`, and settle-boundary messages.
- [ ] `SessionManager.appendUsage(kind, provider, model, usage)` entries count in `getSessionStats()`, the footer, and the cost breakdown.
- [ ] `appendUsage` entries stay out of model context.
- [ ] Chat hides `appendUsage` entries for kinds other than `cache_warm`.
- [ ] Each persisted background result emits one custom `message_end` event.
- [ ] `appendUsage` does not emit `entry_appended`.
- [ ] Pi persists `pi.appendEntry` entries and streams them as `entry_appended`.
- [ ] Session listeners receive the final `message_end` after extension middleware and before Pi saves the assistant message.
- [ ] `get_commands` reports the `subagents` command with its extension's `sourceInfo.path`.
- [ ] A file-based extension has an absolute `sourceInfo.path`, and a synthetic source, such as an inline extension, names no file.
- [ ] With the same path in settings and `-e`, Pi loads the extension once.
- [ ] When `-e` and settings load different copies of the package, Pi stops at startup.
- [ ] An extension command runs at once while the child streams.
- [ ] Pi defers an extension command while `agent_settled` handlers run.
- [ ] `ctx.ui.setStatus` sends its RPC request before the command's `handled` response.
- [ ] A command that throws still returns `handled`, with an `extension_error` record.
- [ ] Tree navigation to a user or custom message moves the leaf to its parent only when that entry is not the current leaf.
- [ ] Tree navigation to any other entry selects that entry.
- [ ] Navigation without a summary appends no entry and emits no `session_start`.
- [ ] Cancelling `session_before_tree` cancels tree navigation.
- [ ] Cancelling `session_before_fork` cancels RPC `fork`.
- [ ] Cancelling `session_before_switch` cancels RPC `new_session`.
- [ ] Before-tree, before-fork, and before-switch hooks run before teardown.
- [ ] After a cancelled change, a cancelled or failed branch summary, or a fork or switch that fails before teardown, Pi emits no session event.
- [ ] `session_tree` and replacement `session_start` supply the final [selected ancestry](../GLOSSARY.md#history), including user-entry parent selection.
- [ ] `getBranch()` supplies the data for task recovery.
- [ ] `get_entries` supports durable entry cursors and supplies the authoritative leaf.
- [ ] Ordinary messages do not emit `entry_appended`.

Ordinary prompts fail during compaction or a branch summary. The cancelled session changes above append no entries.

A handled command can start model work. Work that the connection observed must settle before result collection. A pending prompt prevents collection from closing stdin, and input after closing resumes the task in its child file. A baseline `get_session_stats` read after `begin` gives each run's usage.

Background results use the `custom` role, so they do not keep the child's earlier reply in its result. Live task totals use the `late_usage` delta of the custom `message_end`, because the patch's `appendUsage` call does not emit `entry_appended`.

The extension adds `--extension` with its own source path only when that path is absolute; otherwise, the child's settings must load the package. [Launch arguments](tasks.md#launch-arguments) can add other `-e` flags. See [what a child inherits](children.md#what-a-child-inherits) for the user-visible result.

The before-change hooks invalidate old bindings before teardown. When Pi emits no session event after a change, the [session binding](../GLOSSARY.md#tasks-and-processes) reopens its task registry at the next interaction. Tasks stopped by the change remain cancelled. Ordinary messages need a snapshot refresh, because they do not emit `entry_appended`.

### Extension UI and registration

- [ ] Registration in the extension factory activates a `model-only` tool before `session_start` handlers run.
- [ ] Without a `--tools` list that replaces the defaults, and without `--no-tools` or `--no-builtin-tools`, registering a tool again with an unchanged exposure replaces its definition and does not activate it again.
- [ ] With a `--tools` list that replaces the defaults (no `+`/`-` modifiers), any registration activates every registered declarable tool that the list names.
- [ ] A change to `hidden` removes the tool from the active tools.
- [ ] With agent-core's default parallel mode, two `subagent` calls in one response that has no sequential tool call start before either finishes.
- [ ] Hidden registration prevents model and codemode calls from launching disabled tools.
- [ ] Tool renderers receive partial arguments, shared state, expansion state, and streaming results.
- [ ] The tool render context supplies `keyHint`, which formats Pi's configured keybindings, also for `ToolExecutionComponent` rows that the viewer creates.
- [ ] Pi's default shell draws the box around both renderer slots, with pending, success, and error backgrounds.
- [ ] A renderer's mouse region handles clicks before Pi's expansion toggle.
- [ ] On reload, Pi rebuilds the chat before `session_start`, and the tools registered at load supply the cards of replayed calls.
- [ ] RPC `select`, `confirm`, `input`, and `editor` requests and replies still map to `ctx.ui`.
- [ ] Supported dialog timeouts pass through RPC.
- [ ] `ctx.ui.editor` still takes no abort signal, and the interactive editor still expands tabs, normalises line ends, and trims the text that it returns.
- [ ] `@earendil-works/pi-tui` still exports `Container`, `Spacer`, `Text`, `Loader`, `ScrollView`, `MouseRegion`, `truncateToWidth`, `visibleWidth`, and `isKeyRelease`, which the cards, panel, and viewers import.
- [ ] `truncateToWidth` and `visibleWidth` clip and measure styled text in terminal columns.
- [ ] The theme still defines the `dim`, `muted`, `accent`, `error`, `warning`, `border`, `toolTitle`, `toolOutput`, `mdCode`, `customMessageLabel`, `scrollbarThumb`, and `scrollbarTrack` colours.

These `--tools` contracts set the [registration rule](../AGENTS.md#boundaries). Without a `--tools` list that replaces the defaults, Pi activates a tool again only when its exposure changes to `model-only`, so active tools that another extension chose at `session_start` stay. With such a list, Pi activates every listed tool again on any registration, so a registration after the factory's restores the active tools from before it and keeps only the owned tools whose exposure turned on.

Fire-and-forget child UI is dropped. Because `ctx.ui.editor` takes no signal, a forwarded editor stays open after its run is cancelled, and `editorText` in the [dialog forwarder](../src/child/dialogs.ts) copies the editor's whitespace changes to detect an unchanged prefill; when Pi adds an editor signal, pass it and close the editor on cancellation.

The libs [prompt-parts](../../../libs/src/prompt-parts/README.md) coordinator owns the `before_agent_start` append checks.

### Background jobs

[Jobs](../GLOSSARY.md#tasks-and-processes) use Pi's public bash tool definition with owned process operations, without overriding `bash`.

[ADR 0005](adr/0005-background-jobs.md) defines the tool and delivery contracts; [ADR 0007](adr/0007-own-job-processes-and-bound-logs.md) defines process ownership and bounded logs.

- [ ] `createBashToolDefinition(cwd, { operations, commandPrefix })` and `getShellConfig(shellPath)` remain public exports.
- [ ] `createBashToolDefinition` and `getShellConfig` do not read the user's settings.
- [ ] The tool's `execute` reads `command` and `timeout` and ignores its tool-call ID.
- [ ] The tool's `execute` passes `exec` the prefixed command, working directory, abort signal, timeout in seconds, and the session and model environment from the supplied tool context.
- [ ] The tool maps the operations errors `aborted` and `timeout:N` to `Command aborted` and `Command timed out after N seconds`.
- [ ] The tool resolves `structuredContent.exit_code` from the exit code that the operations return, including non-zero codes.
- [ ] The tool treats a null exit code as a failure.
- [ ] `getShellConfig(shellPath)` returns `shell`, `args`, and optional `commandTransport`.
- [ ] `pi.getSettings()` returns the raw `shellPath` and `shellCommandPrefix` settings.
- [ ] Pi's settings manager expands `~` and `file://` in `shellPath`.
- [ ] On Windows, Pi's settings manager converts Git Bash, MSYS, Cygwin, and WSL drive paths in `shellPath`.
- [ ] Pi passes `shellCommandPrefix` unchanged.
- [ ] Pi's tracked-children cleanup does not cover the owned job operations.
- [ ] Output of the owned job operations does not enter Pi's `onData` accumulator, so Pi creates no second full-output log.
- [ ] `pi.getAllTools()` returns `sourceInfo.source === "builtin"` for Pi's own `bash`, and another source when an extension registers `bash`.
- [ ] `DEFAULT_MAX_LINES`, `DEFAULT_MAX_BYTES`, and `truncateTail` keep the 2,000-line and 50 KiB tail limits of job results and log reads.

The job wrapper must supply the command prefix and resolved shell path explicitly. Jobs classify the `Command aborted` and `Command timed out` status lines before a later abort during group cleanup. The owned runner converts a signal-stopped shell to `128 + signal`, and it supports command arguments and stdin transport.

`shellOptions` in [jobs](../src/jobs/registry.ts) copies the `shellPath` rules of Pi's settings manager.

The registry's synchronous Node `exit` hook covers Pi exits that skip `session_shutdown`, and stays active until group cleanup ends. No private Pi tracker API is imported. Job output stays in the owned bounded writer and result tail.

### Background and viewer contracts

The offline tests exercise background waits in `agent_end`, slash commands during settle waits, abort and stdin-EOF cleanup, print and JSON settling, and prepared idle RPC context. The [SDK race cases](../validation/abort-races.test.ts) cover background results at abort boundaries, aborts after process exit, and descendant cancellation acknowledgements. Use the [manual checks](validation.md) for the TUI path. Recheck these contracts on upgrade:

- [ ] Pi awaits `agent_end` handlers before its post-run processing.
- [ ] Pi sends the RPC `agent_end` event only after the `agent_end` handlers finish.
- [ ] The TUI working loader stays visible until `agent_end` handlers finish.
- [ ] Working-message changes apply while `agent_end` handlers run.
- [ ] `ctx.signal` is live during `agent_end`.
- [ ] RPC `abort` and **Esc** in the TUI abort `ctx.signal` during `agent_end`, and Pi then settles without `agent_before_settle`.
- [ ] `agent_end` messages carry the assistant `stopReason`.
- [ ] Pi flushes `sendMessage` with `triggerTurn: false` in `agent_before_settle` into the transcript, with custom message events, before continuation.
- [ ] Returning `continue: true` from `agent_before_settle` keeps the prepared system prompt without running `before_agent_start` again.
- [ ] Pi also flushes these messages when it settles after an abort.
- [ ] Pi saves `sendMessage` with `triggerTurn: false` in `turn_end`, with custom message events, after the `turn_end` handlers finish, also when an abort follows.
- [ ] The next model request includes a message saved in `turn_end`.
- [ ] Returning `continue: true` from `turn_end` requests one more model response.
- [ ] Tool calls or queued input that already need a request satisfy `continue: true` from `turn_end`, so it adds no second request.
- [ ] `ctx.hasPendingMessages()` counts follow-up and steering input sent through `prompt`, but not messages from `sendMessage()`.
- [ ] Slash commands sent through `prompt` execute while a supervisor waits in `agent_end` or `agent_before_settle`.
- [ ] Terminal execution events precede `agent_end`.
- [ ] `agent_end` can arrive before settle handlers finish.
- [ ] RPC `abort` can wait for settle handlers.
- [ ] Print and JSON modes await settle handlers and consume their continuation messages before exiting.
- [ ] In all modes, an idle `sendMessage` with `triggerTurn` runs `before_agent_start` with `messageType: "custom"`.
- [ ] In all modes, an idle `sendMessage` with `triggerTurn` adds pending `nextTurn` messages after its starting message, in one run.
- [ ] The session is busy when an idle `sendMessage` with `triggerTurn` returns.
- [ ] When an `agent_settled` handler calls `sendMessage` with `triggerTurn`, Pi starts the run after the handlers finish.
- [ ] Pi's session files still have the header, entry structure, unique entry IDs, and parent IDs that name earlier entries that the [child-file reader](../src/history/sessions.ts) requires.
- [ ] Pi runs no tool call of an assistant response with `stopReason: "error"` or `"aborted"`.
- [ ] Session projections associate each visible message with its source entry.
- [ ] After an abort during a tool call, Pi adds an empty assistant message with `stopReason: "aborted"`.
- [ ] JSON `message_start`, `message_update`, and `message_end` events, with `assistantMessageEvent` content indices and tool-call deltas that `parseStreamingJson` reads, rebuild a streaming assistant message.
- [ ] Execution events carry the `toolCallId` of a call in that streaming message.
- [ ] Pi exports each chat component and `create*ToolDefinition` factory that the [transcript viewer](../src/task-panel/viewer.ts) imports.
- [ ] `ToolExecutionComponent` applies streamed `updateArgs`, `updateResult`, and `setExpanded`.
- [ ] Without `setArgsComplete`, the built-in tool renderers read no files, as in Pi's own history.
- [ ] Inline custom UI receives the panel's input and restores the editor when it closes.
- [ ] A full-terminal custom overlay closes only its own overlay.
- [ ] Widget `MouseRegion`s receive fullscreen left clicks.

The supervisor's `agent_end` handler waits only after `stop` or `toolUse`. In print and JSON modes and in nested supervisors, `agent_before_settle` can also wait after a final error, which Pi runs after retry and compaction. Neither wait blocks retry or compaction. Low-level follow-up queues can remain unconsumed after an abort. [Delivery](../src/delivery.ts) uses the `turn_end` save for `resultDelivery: "turn_end"` ([ADR 0006](adr/0006-deliver-background-results-at-turn-end.md)).

A child waits in `agent_end` after a normal reply, and in `agent_before_settle` after a final error that Pi does not recover. Read the final statistics and close stdin after `agent_end` without waiting for the abort reply. A shared deadline still bounds abort, the statistics read, and shutdown. The idle wake in delivery depends on the idle `sendMessage` contracts.

The child-file reader parses complete nonblank JSON lines strictly in memory. It rejects invalid UTF-8, malformed JSON, invalid headers or entry structure, duplicate entry IDs, and a non-null parent ID that does not name an earlier entry. It ignores bytes after the last LF before decoding, including a partial final UTF-8 character, and never modifies the file. Pi owns the entry payloads, which the reader retains unchanged. Do not substitute Pi's permissive `parseSessionEntries` helper or `SessionManager.open`; see [limitations](#limitations).

The resume warning ignores the calls of a failed or aborted response, and the viewer shows the response's error for them. Through the session projections, `show --last` returns the active conversation's text and cursor. The child file's ancestry of the selected run supplies digest paging, cursors, and cumulative usage; raw append-order entries from abandoned branches are excluded. The [last-text test](../validation/show.test.ts) confirms that Pi adds the empty aborted message after an abort during a tool call, because without that message the skip has no coverage.

Regular mode uses `ctx.ui.custom` with `overlay: false`, and fullscreen mode a full-terminal overlay. Host remounts preserve the logical task panel and transcript.

The [input cases](../validation/input.test.ts) exercise running input, deferred settle-boundary input, input during exit and resume, and owner-only resume of inactive descendants. The [digest cases](../validation/show.test.ts) exercise ancestry-scoped paging.

## Limitations

- In Pi 1.0.2, 1.2.0, 1.3.0, 1.4.0, and 1.5.0, Pi added an empty assistant message with `stopReason: "error"` after an abort during a tool call. In Pi 1.5.1 and 1.5.2, the message has `stopReason: "aborted"`.
- In Pi 1.2.0, a source comparison with Pi 1.0.2 found the session manager, RPC mode, session runtime, extension loader, tree navigation, extension-command handling, `entry_appended` emission, and session statistics unchanged. `agent_settled` gained an `aborted` field.
- In Pi 1.3.0, a source comparison with Pi 1.2.0 found the session manager, RPC mode, print mode, extension runner, extension types, and agent core unchanged. `AgentSession` changed only in restoring a resumed session's tool loadout from its transcript.
- In Pi 1.3.0, Pi's session loader appends a newline to a file that ends with a partial line.
- In Pi 1.4.0, a source comparison with Pi 1.3.0 found the session manager, RPC mode, print mode, extension runner, and extension types unchanged. `AgentSession` changed in transcript tool restoration, recovery omission, and the compaction check; agent core added request `identity`.
- In Pi 1.4.0, a source review found that resume also turns on registered `direct` and `model-only` tools that the child file never recorded, unless `defaultActive: false`. The `session_start` registration hides them again where needed.
- In Pi 1.5.0, a source comparison with Pi 1.4.0 found RPC mode, print mode, the extension runner, the bash tool, truncation, and the agent loop unchanged. The session manager now removes an entry from memory when its write fails, and forks write through one file handle; `appendCustomMessageEntry` and `appendUsage` are unchanged. `AgentSession` keeps the order of tools that stay active and appends newly activated ones; hidden tools still drop out of the loadout.
- In Pi 1.5.0 to 1.5.2, `ToolExecutionComponent.updateArgs` applies new arguments at the next render instead of at once.
- In Pi 1.5.1, a source comparison with Pi 1.5.0 found the session manager, the agent loop, and transcript tool restoration unchanged. The extension runner changed only for Markdown transformers, the bash tool only in the timeout status of Pi's local shell operations, which jobs replace, and truncation outside `truncateTail` and the default limits. The session runtime, RPC mode, and print mode changed in shutdown; the [launch and stop](#launch-and-stop) checklist names the abort and SIGTERM contracts. `AgentSession.reload()` now rejects a call during a run or a compaction.
- In Pi 1.5.2, a source comparison with Pi 1.5.1 found the session manager, `AgentSession`, RPC mode, print mode, the extension runner, the bash tool, and agent core unchanged. Startup, interactive mode, and the session runtime changed only in opening a session whose stored working directory is missing: interactive mode now also offers to fork it. Children run in RPC mode, which still exits with an error.
- In Pi 1.5.1 and 1.5.2, a source review found that the `cacheWarming` setting defaults to `idle`, also in a child. Pi then keeps the child's cache-warming timer after the run settles, and cancels it when it disposes the session, after `session_shutdown`. A warming request that completes between the supervisor's read of the child's statistics and that disposal adds a usage entry to the [child file](../GLOSSARY.md#history), outside the run's reported usage.

## Replacement opportunities

Pi 1.5.2 exposes no extension API for writing usage entries in the current session and does not count usage on custom messages. The `SessionManager.prototype.appendCustomMessageEntry` wrapper supplies [late usage](../GLOSSARY.md#results) in session totals, the footer, the cost breakdown, and nested supervisors' run usage ([ADR 0002](adr/0002-count-late-background-usage.md)). A public replacement must write usage at custom-message persistence or count usage on custom messages.
