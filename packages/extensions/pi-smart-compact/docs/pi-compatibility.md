# Pi compatibility

[pi-smart-compact](../README.md) · [Testing](testing.md)

> Last verified against Pi 1.0.0 (API modules and installed bundled CLI; offline tests). Not covered: interactive progress, **Escape** behaviour, and real-provider summary quality.

For maintainers upgrading Pi. Terms used below:

- _Fingerprint_: a reviewed hash of a private Pi method's source. The extension refuses to run when a hash doesn't match.
- _Between-response boundary_: the point after a tool batch is saved and before the next model request, where Pi may compact.
- _Split turn_: a summary of a turn too long to keep whole, written by Pi with its own prompt.
- _Default summary_: a summary from Pi's built-in summarizer, as opposed to one supplied by a `session_before_compact` hook.

## Supported boundary

At session binding, the [compatibility checks](../src/compatibility.ts) require Pi 1.0.0 and reviewed fingerprints for:

- five prototype methods: `_compactBeforeNextAssistantResponse`, `_runAutoCompaction`, `_runDefaultCompaction`, `_appendCustomMessage`, and `compact`;
- the exported lower-level `compact` implementation.

Unknown versions, unknown fingerprints, and conflicting replacements of the boundary are rejected. Calling the unavailable tool shows the initialization error.

Fingerprints guard implementations; they don't guarantee compatibility with every third-party extension. Never refresh them just to pass a test.

## Upgrade procedure

1. Review the changed source, prompts, consumers, and lifecycle. Review prompt or dependency changes within the same version too.
2. Work through the checklist below.
3. Run the [package checks](../README.md#validation). Both the real bundled CLI and the API runtime must pass before you accept new fingerprints.
4. Do the [manual checks](#manual-checks).
5. Update the "Last verified" line.

## Checklist

Work through each area below before accepting new fingerprints.

### Tools

- [ ] `compact` has `exposure: "model-only"`. Direct model calls keep replayable request results, and nested execution cannot schedule compaction.
- [ ] `context_window` can still be composed through `ctx.tools` and `ctx.executeTool()`.
- [ ] The public `ctx.getContextUsage()` returns `{ tokens: number | null, contextWindow: number, percent: number | null }` or `undefined`.
- [ ] `context_window` serialises that object unchanged and keeps it in result details. `undefined` produces an unavailable message, never invented usage. This tool uses no private APIs.

### Between-response boundary

- [ ] The boundary runs after all tool results are saved, inside the still-active agent run, before the next model request. Its context accepts updated `messages` without changing other fields.
- [ ] `_runAutoCompaction("manual", false)` accepts and forwards `manual` at runtime without calling `abort()`. Its boolean result means continuation is queued, not that compaction succeeded. Ordinary tool follow-up still advances the agent loop.

### Outcomes and status messages

- [ ] When Pi emits `compaction_end`, a session-scoped `subscribe()` listener receives it before the native attempt resolves. The listener is removed on every exit.
- [ ] Its `result`, `error`, and `aborted` fields distinguish completed, failed, and cancelled outcomes. A completed result relies on the native entry and summary, and must not add a success notice.
- [ ] A native attempt that returns without an event is reported as skipped. A specific reason is given only for a missing model or a leaf that is already compacted. Native preparation can swallow an error without emitting an event, so a missing event doesn't prove the session was too small.
- [ ] Unexpected exceptions propagate without a status message.
- [ ] `_appendCustomMessage` saves a custom-message entry, refreshes finalized context, and emits message start and end events synchronously, without queueing or continuing the agent.
- [ ] The status is visible in the next request, the transcript, and the reopened session. Disposed bindings must not append it.

Public `sendMessage` with `triggerTurn: false` can't replace `_appendCustomMessage`: it still defers while streaming, which is too late for this response.

### Summary-model metadata

- [ ] Metadata for default summaries matches the controller of the native operation, even when model routing is off.
- [ ] The summary router returns the native result and selected model and thinking facts separately. It snapshots those facts before asynchronous routing or generation, so later changes to the session's thinking don't affect metadata.
- [ ] Unrelated signals and summaries from hooks produce no metadata.
- [ ] Native manual and automatic compaction call `SessionManager.appendCompaction` synchronously, after their final abort check.
- [ ] The temporary wrapper inserts one `pi-smart-compact.model` custom entry immediately before that write, so the compaction entry stays the leaf.
- [ ] `pi.appendEntry` emits an entry event without adding model context, and `registerEntryRenderer` renders valid stored metadata.
- [ ] Abort, terminal events, and disposal deactivate pending persistence and restore only owned hooks, including when another wrapper keeps one.

### Footer status

- [ ] `session_compact` is emitted only after the compaction entry is saved.
- [ ] `SessionManager.getBranch()` exposes `compaction` entries through the read-only context.
- [ ] `ctx.ui.setStatus(key, undefined)` clears a footer status.
- [ ] Compactions proposed at the boundary don't emit `session_compact`, so `turn_start` and `agent_settled` must see the committed drafts.

The status counts entries rather than events, so resumed sessions and tree navigation stay accurate. RPC forwards `setStatus` to the client but doesn't guarantee it is displayed.

### What Pi still owns

- [ ] Pi still owns native preparation, the active model's compaction settings, hook cancellation and custom summaries, retries, usage and file metadata, saving compaction entries, and rebuilding the finalized projection.
- [ ] Selecting a summary model changes its output cap, but not retention settings or the session's model and thinking metadata.
- [ ] `compaction_start`, `compaction_end`, retry events, and the before, success, and failure hooks accept `manual`.
- [ ] UI consumers still use native `isCompacting` and `abortCompaction()`. No idle transition or final print response happens during compaction.

### Model selection

- [ ] `ctx.isProjectTrusted()` gates cwd configuration.
- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs, including nested IDs.
- [ ] `getSupportedThinkingLevels()` validates explicit thinking without provider-specific mappings.
- [ ] When thinking isn't configured, `pi.getThinkingLevel()` supplies the session's level for acknowledgements. Non-reasoning summary models default to `off`.
- [ ] For a virtual summary model with an explicit thinking override, the override reaches `session.modelRuntime.resolveModel()` before native generation, with `reason: "direct"`, the current converted transcript, and the owning abort signal.
- [ ] The returned physical model and level govern generation and output caps. Returned selection facts keep the selected virtual model and input level, without mutating the native argument tuple. Unconfigured virtual routing stays native.

The compatibility boundary defines Pi's `pi-virtual` API marker itself, because the public entry point doesn't export its predicate.

### Provider requests

- [ ] Configured summaries use `ctx.modelRegistry.streamSimple()`, for provider authentication and thinking mapping at request time.
- [ ] Native request keys, headers, and environment are cleared from intercepted options before registry dispatch. The registry supplies the selected provider's credentials and base URL.
- [ ] Authentication and generation errors and aborts reach native outcomes and retries, with no fallback to the active model.
- [ ] Registry calls skip the session stream's request defaults, so the adapter mirrors the public `settingsManager` retry and timeout policy:
  - request options take precedence;
  - a provider timeout overrides the HTTP idle timeout;
  - an idle timeout of zero becomes `2147483647`.
- [ ] The `transformHeaders` callback dispatches `before_provider_headers` through the native runner after the selected provider authenticates, once per summary attempt, and deactivates when summarization ends.

On each upgrade, recheck the policy and hook ordering against the SDK session stream.

### Default summarizer

- [ ] `_runDefaultCompaction` takes arguments in this order: preparation, model, instructions, signal, reason.
- [ ] Its default implementation uses `agent.streamFunction` for history and split-turn summaries, including retries.
- [ ] Passing the selected or routed physical model to the original summarizer controls token caps. The native adapter forwards only its unchanged result to Pi. Stream options carry the native thinking level and can be overridden without changing session state.

### Manual and automatic entry points

- [ ] `AgentSession.compact()` is the shared entry point for `/compact`, RPC, and SDK manual compaction. Its default summarizer receives `reason: "manual"` and `_compactionAbortController.signal`, which differs from the automatic controller used by tool requests.
- [ ] `applyToManual` routing is scoped to the session and matches both reason and signal. It passes automatic and unrelated operations through unchanged, and leaves native instructions, hooks, retries, cancellation, persistence, and return and error behaviour intact.
- [ ] `_runAutoCompaction("threshold" | "overflow", ...)` passes its trigger reason and its own `_autoCompactionAbortController.signal` to the default summarizer, with no custom instructions.
- [ ] `applyToAuto` routing matches a non-manual reason and that signal, so tool requests (`reason: "manual"` on the same controller) never take this route. It leaves thresholds, hooks, retries, overflow retry and continuation, persistence, and error reporting intact.

### Focus

- [ ] The manual entry-point wrapper passes combined file and per-call instructions to native `compact()`, which forwards them to hooks and default summarization.
- [ ] The automatic entry-point wrapper limits file instructions to threshold and overflow attempts, and keeps reason and retry arguments. Tool focus is composed separately at the boundary.
- [ ] The summary router applies split-turn focus only to the owning operation, whatever the model opt-ins say.
- [ ] The split-turn prompt ends in the exact instruction block inspected in [instructions.ts](../src/instructions.ts), carried by one text block in the final user message.
- [ ] History prompts already include custom instructions and must not receive them twice.
- [ ] Provider context is cloned for each attempt, so retries never accumulate focus text.
- [ ] The public `session.extensionRunner` getter exposes the runner that emits automatic and tool-requested `session_before_compact` events with `_autoCompactionAbortController.signal`. Scoped `emit` overrides keep return values, receivers, unrelated events, and operations with another signal or reason.

On each upgrade, recheck all four prototype wrappers and their restoration, including retained callbacks.

### Lifecycle and cleanup

- [ ] `session_start` supplies the real session-manager identity.
- [ ] Shutdown, session replacement, and reload dispose old bindings. Settlement clears unconsumed requests.
- [ ] Several active sessions share the boundary, the manual and automatic wrappers, and the summary router, without sharing requests, file focus, or model configuration.
- [ ] Targets of temporary methods and stream functions are writable data properties.
- [ ] Cleanup of owned hooks deactivates retained callbacks, restores property shape, and respects later replacements.
- [ ] Manual and automatic compaction with only the flags set, and no file focus, need no stream replacement.

## Manual checks

Setup: an interactive Pi session with the extension loaded and a configured provider.

| Do                                                       | Expect                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ask the model to call `compact` during a multi-step task | Pi's compaction progress shows, and the task continues afterwards.           |
| Press **Escape** during compaction                       | Compaction is cancelled; the agent run continues with a cancellation status. |
| Read the resulting summary with a real provider          | It keeps the requested focus and the information needed to continue.         |

## Limitations

These are known gaps and the places where a public Pi API could replace private patches.

- **No public API.** There is no public way to run native compaction and then continue. `ctx.compact()` aborts the current run, and boundary entries would need summaries written by the extension rather than Pi. Replace the private patches if Pi adds a public API with the same lifecycle guarantees.
- **`manual` reason.** Passing `manual` is outside `_runAutoCompaction`'s declared contract, which expects automatic reasons only. Native failure text may still say `Auto-compaction failed` (observed in Pi 0.99.2); the outcome message removes that misleading prefix.
- **Acknowledgement only.** The tool result confirms only that compaction was scheduled. A separate `pi-smart-compact.result` message records skipped attempts and the cancellations or failures Pi reports. Unexpected exceptions can stop continuation, and aborting the whole run prevents it.
- **Override scope.** Model and thinking overrides apply to the tool's default summaries, and optionally to manual (`applyToManual`) and automatic (`applyToAuto`) summaries. File focus applies to every route and combines with per-call instructions. Custom handlers receive the combined instructions but control their own requests and output.
- **Overflow recovery.** Automatic recovery keeps Pi's native preparation and serialisation. `overflow` can mean a recoverable length stop, not only an exceeded context window. Content removed before recovery stays removed if summarisation fails.
- **Authentication.** Pi resolves summarisation authentication inside the default summarizer, after hooks, so summaries from hooks skip it. Configured requests use the registry stream with isolated credentials, not private authentication helpers or arbitrary stream overrides. Unrelated operations use the original stream.
- **Not a transaction.** Summary-model metadata and native compaction are separate session writes. A storage error can leave one without the other. The cancellation guarantee applies only before native persistence starts.
- **Late patches.** Fingerprint checks don't inspect overrides on session instances, and don't detect patches installed after binding. Combinations of third-party patches and reloads aren't guaranteed to work. Cleanup deactivates retained wrappers and leaves later replacements alone.
