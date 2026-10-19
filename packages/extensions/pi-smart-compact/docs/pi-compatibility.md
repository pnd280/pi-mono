# Pi compatibility for maintainers

[pi-smart-compact](../README.md) · [Testing](testing.md)

> Last verified against Pi 1.3.0 with a source review of the release changes, a fingerprint comparison, and offline API and installed-CLI tests. Not covered: interactive progress, **Escape** behaviour, and real-provider summary quality.

Terms used below:

- _Fingerprint_: a reviewed hash of a private Pi method's source. The extension refuses to run when a hash doesn't match.
- _Between-response boundary_: the point after a tool batch is saved and before the next model request, where Pi may compact.
- _Split turn_: a summary of a turn too long to keep whole, written by Pi with its own prompt.
- _Default summary_: a summary from Pi's built-in summariser, as opposed to one supplied by a `session_before_compact` hook.

## Supported boundary

At session binding, the [compatibility checks](../src/compatibility.ts) require Pi 1.3.0 and reviewed fingerprints for:

- five prototype methods: `_compactBeforeNextAssistantResponse`, `_runAutoCompaction`, `_runDefaultCompaction`, `_appendCustomMessage`, and `compact`;
- the exported lower-level `compact` implementation.

The checks hold one fingerprint set for the API modules and one for the installed bundled CLI, because the CLI bundle is minified. A minifier rename changes only the CLI set.

Unknown versions, unknown fingerprints, and conflicting replacements of the boundary are rejected. Calling the unavailable tool shows the initialisation error.

Fingerprints guard implementations; they don't guarantee compatibility with every third-party extension. Never refresh them just to pass a test.

## Upgrade procedure

1. Review the changed source, prompts, consumers, and lifecycle. Review prompt or dependency changes within the same version too.
2. Work through the checklist below.
3. Run the [package checks](../../../../docs/development.md#focused-validation). Both the real bundled CLI and the API runtime must pass before you accept new fingerprints.
4. Do the [manual checks](#manual-checks).
5. Update the "Last verified" line.

## Checklist

Work through each area below before accepting new fingerprints.

### Tools

- [ ] `compact` has `exposure: "model-only"`, so direct model calls keep replayable request results.
- [ ] Nested execution of `compact` can't schedule compaction.
- [ ] `context_window` can still be composed through `ctx.tools` and `ctx.executeTool()`.
- [ ] Without `--tools`, registering `context_window` again in `session_start` with an unchanged exposure replaces its description and doesn't activate it again.
- [ ] Without `--tools`, active tools chosen by an earlier `session_start` handler stay active after that registration.
- [ ] With `--tools`, any registration activates every registered declarable tool that the list names.
- [ ] Pi emits `resources_discover`, where [lifecycle](../../../libs/src/lifecycle/README.md) startup commits run, after every `session_start` handler.
- [ ] The public `ctx.getContextUsage()` returns `{ tokens: number | null, contextWindow: number, percent: number | null }` or `undefined`.
- [ ] `context_window` serialises that object unchanged and keeps it in result details.
- [ ] `context_window` returns an unavailable message for `undefined`, never invented usage.

The extension registers `context_window` in its factory, so Pi activates it before `session_start` handlers, such as a profile's, choose the active tools. Because lifecycle startup commits run after every `session_start` handler, a profile's choice still wins with `--tools`. `context_window` uses no private APIs.

### Between-response boundary

- [ ] The boundary runs after all tool results are saved, inside the still-active agent run, before the next model request.
- [ ] The boundary's context accepts updated `messages` without changing other fields.
- [ ] `_runAutoCompaction("manual", false)` accepts and forwards `manual` at runtime without calling `abort()`.
- [ ] The boolean result of `_runAutoCompaction()` means that continuation is queued, not that compaction succeeded.
- [ ] Ordinary tool follow-up still advances the agent loop.

### Outcomes and status messages

- [ ] When Pi emits `compaction_end`, a session-scoped `subscribe()` listener receives it before the native attempt resolves.
- [ ] The `compaction_end` listener is removed on every exit.
- [ ] The `result`, `errorMessage`, and `aborted` fields of `compaction_end` distinguish completed, failed, and cancelled outcomes.
- [ ] A completed result relies on the native entry and summary, and adds no success notice.
- [ ] A native attempt that returns without an event is reported as skipped.
- [ ] A skipped attempt gets a specific reason only for a missing model or a leaf that is already compacted.
- [ ] Unexpected exceptions propagate without a status message.
- [ ] `_appendCustomMessage` saves a custom-message entry, refreshes finalised context, and emits message start and end events synchronously, without queueing or continuing the agent.
- [ ] The status is visible in the next request, the transcript, and the reopened session.
- [ ] Disposed bindings don't append the status.

Native preparation can swallow an error without emitting an event, so a missing event doesn't prove that the session was too small. Public `sendMessage` with `triggerTurn: false` can't replace `_appendCustomMessage`: it still defers while streaming, which is too late for this response.

### Summary-model metadata

- [ ] Metadata for default summaries matches the controller of the native operation, even when model routing is off.
- [ ] The summary router returns the native result separately from the selected model and thinking facts.
- [ ] The summary router snapshots the selection facts before asynchronous routing or generation, so later changes to the session's thinking don't affect metadata.
- [ ] Unrelated signals and summaries from hooks produce no metadata.
- [ ] Native manual and automatic compaction call `SessionManager.appendCompaction` synchronously, after their final abort check.
- [ ] The temporary wrapper inserts one `pi-smart-compact.model` custom entry immediately before that write, so the compaction entry stays the leaf.
- [ ] `pi.appendEntry` emits an entry event without adding model context.
- [ ] `registerEntryRenderer` renders valid stored metadata.
- [ ] Abort, terminal events, and disposal deactivate pending persistence.
- [ ] Abort, terminal events, and disposal restore only owned hooks, also when another wrapper keeps one.

### Footer status

- [ ] `session_compact` is emitted only after the compaction entry is saved.
- [ ] `SessionManager.getBranch()` exposes `compaction` entries through the read-only context.
- [ ] `ctx.ui.setStatus(key, undefined)` clears a footer status.
- [ ] Successful tool-requested compaction emits `session_compact` through `_runAutoCompaction`.
- [ ] `turn_start` and `agent_settled` are still emitted, so they can refresh the count from the saved branch.

The status counts entries rather than events, so resumed sessions and tree navigation stay accurate. See [What you see](../README.md#what-you-see) for the interactive-terminal display limit.

### What Pi still owns

- [ ] Pi still owns native preparation, the active model's compaction settings, hook cancellation and custom summaries, retries, usage and file metadata, saving compaction entries, and rebuilding the finalised projection.
- [ ] Selecting a summary model changes its output cap, but not retention settings or the session's model and thinking metadata.
- [ ] `compaction_start`, `compaction_end`, retry events, and the before, success, and failure hooks accept `manual`.
- [ ] UI consumers still use native `isCompacting` and `abortCompaction()`.
- [ ] No idle transition or final print response happens during compaction.

### Model selection

- [ ] `ctx.isProjectTrusted()` gates cwd configuration.
- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs, including nested IDs.
- [ ] The [shared thinking levels](../../../utils/src/thinking-levels.ts) list every level that rules accept, including `off`, and match the levels in [configuration](configuration.md).
- [ ] `getSupportedThinkingLevels()` validates explicit thinking without provider-specific mappings.
- [ ] When thinking isn't configured, `pi.getThinkingLevel()` supplies the session's level for acknowledgements.
- [ ] Non-reasoning summary models default to `off`.
- [ ] For a virtual summary model with an explicit thinking override, the override reaches `session.modelRuntime.resolveModel()` before native generation, with `reason: "direct"`, the current converted transcript, and the owning abort signal.
- [ ] The physical model and level that `resolveModel()` returns govern generation and output caps.
- [ ] Returned selection facts keep the selected virtual model and input level, without mutating the native argument tuple.
- [ ] Unconfigured virtual routing stays native.

The compatibility boundary defines Pi's `pi-virtual` API marker itself, because the public entry point doesn't export its predicate.

### Provider requests

- [ ] Configured summaries use `ctx.modelRegistry.streamSimple()`, for provider authentication and thinking mapping at request time.
- [ ] Pi selects `samplingParamsByThinkingLevel` from the effective physical thinking level.
- [ ] Summary routing preserves the model's sampling configuration and request overrides without copying the conversation model's defaults.
- [ ] Native request keys, headers, and environment are cleared from intercepted options before registry dispatch.
- [ ] The registry supplies the selected provider's credentials and base URL.
- [ ] Authentication and generation errors and aborts reach native outcomes and retries, with no fallback to the active model.
- [ ] Registry calls skip the session stream's request defaults.
- [ ] The adapter's retry and timeout policy matches the public `settingsManager` policy: request options take precedence, a provider timeout overrides the HTTP idle timeout, and an idle timeout of zero becomes `2147483647`.
- [ ] The `transformHeaders` callback dispatches `before_provider_headers` through the native runner after the selected provider authenticates, once per summary attempt.
- [ ] The `transformHeaders` callback deactivates when summarisation ends.

On each upgrade, recheck the policy and hook ordering against the SDK session stream.

### Default summariser

- [ ] `_runDefaultCompaction` takes arguments in this order: preparation, model, instructions, signal, reason.
- [ ] The default implementation of `_runDefaultCompaction` uses `agent.streamFunction` for history and split-turn summaries, including retries.
- [ ] Passing the selected or routed physical model to the original summariser controls token caps.
- [ ] The native adapter forwards only the unchanged result of the original summariser to Pi.
- [ ] Stream options carry the native thinking level and can be overridden without changing session state.

### Manual and automatic entry points

- [ ] `AgentSession.compact()` is the shared entry point for `/compact`, RPC, and SDK manual compaction.
- [ ] The default summariser of `AgentSession.compact()` receives `reason: "manual"` and `_compactionAbortController.signal`, which differs from the automatic controller used by tool requests.
- [ ] `applyToManual` routing is scoped to the session, matches both reason and signal, and passes automatic and unrelated operations through unchanged.
- [ ] `applyToManual` routing leaves native instructions, hooks, retries, cancellation, persistence, and return and error behaviour intact.
- [ ] `_runAutoCompaction("threshold" | "overflow", ...)` passes its trigger reason and its own `_autoCompactionAbortController.signal` to the default summariser, with no custom instructions.
- [ ] `applyToAuto` routing matches a non-manual reason and that signal, so tool requests (`reason: "manual"` on the same controller) never take this route.
- [ ] `applyToAuto` routing leaves thresholds, hooks, retries, overflow retry and continuation, persistence, and error reporting intact.

### Focus

- [ ] The manual entry-point wrapper passes combined file and per-call instructions to native `compact()`, which forwards them to hooks and default summarisation.
- [ ] The automatic entry-point wrapper limits file instructions to threshold and overflow attempts, and keeps reason and retry arguments.
- [ ] The summary router applies split-turn focus only to the owning operation, whatever the model opt-ins say.
- [ ] The split-turn prompt ends in the exact instruction block inspected in [instructions.ts](../src/instructions.ts), carried by one text block in the final user message.
- [ ] History prompts already include custom instructions, and the extension doesn't add them twice.
- [ ] Provider context is cloned for each attempt, so retries never accumulate focus text.
- [ ] The public `session.extensionRunner` getter exposes the runner that emits automatic and tool-requested `session_before_compact` events with `_autoCompactionAbortController.signal`.
- [ ] Scoped `emit` overrides keep return values, receivers, unrelated events, and operations with another signal or reason.

Tool focus is composed separately at the boundary. On each upgrade, recheck all four prototype wrappers and their restoration, including retained callbacks.

### Lifecycle and cleanup

- [ ] `session_start` supplies the real session-manager identity.
- [ ] Shutdown, session replacement, and reload dispose old bindings.
- [ ] Settlement clears unconsumed requests.
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

In Pi 1.3.0, every reviewed fingerprint matched without change.

For request outcomes and routing scope, see [usage](../README.md#compact) and [configuration](../README.md#configuration).

The gaps below concern private Pi integration; [replacement opportunities](#replacement-opportunities) lists the public APIs needed to remove those hooks.

| Gap               | Effect                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No public API     | There is no public way to run native compaction and then continue. `ctx.compact()` aborts the current run, and boundary entries would need summaries written by the extension rather than Pi. Replace the private patches if Pi adds a public API with the same lifecycle guarantees.                        |
| `manual` reason   | Passing `manual` is outside `_runAutoCompaction`'s declared contract, which expects automatic reasons only. Native failure text may still say `Auto-compaction failed` (observed in Pi 0.99.2, still in the Pi 1.3.0 source). The outcome message removes that misleading prefix.                            |
| Overflow recovery | Automatic `overflow` recovery keeps Pi's native preparation and serialisation. See [recovery behaviour](../README.md#errors) for responses that stop at the output-length limit, and for retained context edits.                                                                                             |
| Authentication    | Pi resolves summarisation authentication inside the default summariser, after hooks, so summaries from hooks skip it. Configured requests use the registry stream with isolated credentials, not private authentication helpers or arbitrary stream overrides. Unrelated operations use the original stream. |
| Concurrent calls  | Native compaction uses shared per-session state. SDK callers must follow the [manual-compaction constraint](../README.md#compact).                                                                                                                                                                           |
| Not a transaction | The temporary metadata wrapper has the [session-write and cancellation limits](../README.md#side-effects).                                                                                                                                                                                                   |
| Late patches      | Fingerprint checks don't inspect overrides on session instances, and don't detect patches installed after binding. Combinations of third-party patches and reloads aren't guaranteed to work. Cleanup deactivates retained wrappers and leaves later replacements alone.                                     |

## Replacement opportunities

No public API in Pi 1.3.0 keeps all the features of any private hook below, so every hook stays. `ctx.compact()` still aborts the run, `session_before_compact` can cancel or replace a summary but can't change its instructions or model, and `compaction.modelOverrides` sets only token budgets.

| Private hook                                                                        | Features that depend on it                                                                 | Parity  | Public API Pi would need                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `_compactBeforeNextAssistantResponse` (prototype)                                   | `compact` tool requests at the between-response boundary, and their status messages        | None    | A request for native compaction before the next response, with instructions and outcome, that doesn't abort the run |
| `_runDefaultCompaction` (prototype), `agent.streamFunction` (instance, per attempt) | Summary-model and thinking routing, credential isolation, split-turn focus, and metadata   | None    | Native selection of the summary model and thinking level for default summaries, reported to the persistence step    |
| `_runAutoCompaction` and `compact` (prototype)                                      | Instruction-file focus for automatic and manual compaction                                 | None    | Extension-supplied instructions for every compaction route, seen by all `session_before_compact` handlers           |
| `_runDefaultCompaction` and `extensionRunner.emit` (instance, per attempt)          | Focus for automatic and tool-requested attempts, in summaries and `session_before_compact` | None    | The instruction API in the row above                                                                                |
| `sessionManager.appendCompaction` (instance, per attempt)                           | A metadata entry written before the compaction entry, after Pi's final abort check         | Partial | A summary-model field on the compaction entry, or a hook that writes before it                                      |
| `_appendCustomMessage` (called, not replaced)                                       | Status messages that reach the next request                                                | Partial | Immediate custom-message append between responses                                                                   |

- `session_compact` with `pi.appendEntry()` could save metadata, but only after the compaction entry, which would then stop being the leaf.
- `pi.sendMessage()` with `triggerTurn: false` still waits for the next `turn_end` while streaming, so the status would arrive after the response it explains.
