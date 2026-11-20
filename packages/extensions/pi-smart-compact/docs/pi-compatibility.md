# Pi compatibility for maintainers

[pi-smart-compact](../README.md) · [Testing](testing.md)

> Last verified against Pi 1.6.0 with the package checks, offline API and installed-CLI tests, `vpr fingerprints:check` for this package's hashes, and a source review of the Pi 1.5.2 to 1.6.0 changes. Not covered: interactive progress, **Escape** behaviour, real-provider summary quality, summary requests with a real stored OAuth login, the Codex `max_output_tokens` request body, and GPT-6.2 reasoning removal after a real compaction.

Terms used below:

- _Fingerprint_: a reviewed hash of a private Pi method's source. A mismatch stops the extension from binding to the session; see [supported boundary](#supported-boundary).
- _Between-response boundary_: the point after a tool batch is saved and before the next model request, where Pi may compact.
- _Default summary_: a summary from Pi's built-in summariser, as opposed to one supplied by a `session_before_compact` hook.

## Supported boundary

At session binding, the [compatibility checks](../src/compatibility.ts) require Pi 1.6.0 and reviewed fingerprints for:

- five prototype methods: `_compactBeforeNextAssistantResponse`, `_runAutoCompaction`, `_runDefaultCompaction`, `_appendCustomMessage`, and `compact`;
- the exported lower-level `compact` implementation.

Unknown versions, unknown fingerprints, and conflicting replacements of the boundary are rejected. Calling the unavailable tool shows the initialisation error.

## Checklist

### Tools

- [ ] With a `--tools` list that replaces the defaults (no `+`/`-` modifiers), any registration activates every registered declarable tool that the list names.
- [ ] Pi emits `resources_discover`, where [lifecycle](../../../libs/src/lifecycle/README.md) startup commits run, after every `session_start` handler.
- [ ] The public `ctx.getContextUsage()` returns `{ tokens: number | null, contextWindow: number, percent: number | null }` or `undefined`.

### Outcomes and status messages

- [ ] A native attempt that returns without an event is reported as skipped.
- [ ] A skipped attempt gets a specific reason only for a missing model or a leaf that is already compacted.
- [ ] `registerMessageRenderer` shows the status in the transcript as plain text, without the provider's terminal controls.

### Summary-model metadata

- [ ] `registerEntryRenderer` renders valid stored metadata.

### Footer status

- [ ] `session_compact` is emitted only after the compaction entry is saved.
- [ ] `ctx.ui.setStatus(key, undefined)` clears a footer status.
- [ ] `turn_start` and `agent_settled` are still emitted, so they can refresh the count from the saved branch.

### Context status

- [ ] In `before_agent_start` and `turn_end` handlers, `ctx.getContextUsage()` estimates the projected context: the usage of the latest valid response plus an estimate for later messages, or an estimate of the whole projection when a context edit follows that response.
- [ ] An assistant message names the `provider` and `model` that produced it, which under a virtual selection is the physical model.

### What Pi still owns

- [ ] Selecting a summary model changes the output limit that applies, but not retention settings or the session's model and thinking metadata. Compaction sets no summary `maxTokens`, so pi-ai uses the model's `maxTokens`, clamped to the context.

### Model selection

- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs, including nested IDs.
- [ ] Non-reasoning summary models default to `off`.
- [ ] Unconfigured virtual routing stays native.

### Provider requests

- [ ] Pi selects `samplingParamsByThinkingLevel` from the effective physical thinking level.
- [ ] Summary routing preserves the model's sampling configuration and request overrides without copying the conversation model's defaults.
- [ ] For OpenCode models, registry dispatch sends the summary request's session ID in the `x-opencode-session` header (`getOpenCodeSessionHeaders` in `model-runtime.js`).
- [ ] The adapter's retry and timeout policy matches the public `settingsManager` policy: request options take precedence, a provider timeout overrides the HTTP idle timeout, and an idle timeout of zero becomes `2147483647`.

### Manual and automatic entry points

- [ ] `AgentSession.compact()` is the shared entry point for `/compact`, RPC, and SDK manual compaction.

## Manual checks

Setup: an interactive Pi session with the extension loaded, a configured provider, and enough earlier conversation for Pi to summarise.

| Do                                                       | Expect                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ask the model to call `compact` during a multi-step task | Pi's compaction progress shows, and the task continues afterwards.           |
| Press **Escape** during compaction                       | Compaction is cancelled; the agent run continues with a cancellation status. |
| Read the resulting summary with a real provider          | It keeps the requested focus and the information needed to continue.         |

## Limitations

For request outcomes and routing scope, see [compaction requests](requests.md) and [configuration](../README.md#configuration).

The gaps below concern private Pi integration; [replacement opportunities](#replacement-opportunities) lists the public APIs needed to remove those hooks.

| Gap               | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No public API     | No public API runs the whole native compaction and then continues. `ctx.compact()` aborts the current run. Boundary entries can use Pi's exported summary functions, but the extension would then own preparation, hooks, progress, cancellation, and persistence.                                                                                                                                                                                                                                   |
| `manual` reason   | Passing `manual` is outside `_runAutoCompaction`'s declared contract, which expects automatic reasons only. In Pi 1.4.0 to 1.6.0, native failure text may still say `Auto-compaction failed`. The outcome message removes that misleading prefix.                                                                                                                                                                                                                                                    |
| Overflow recovery | Automatic `overflow` recovery keeps Pi's native preparation and serialisation. See [recovery behaviour](requests.md#failed-attempts) for responses that stop at the output-length limit, and for retained context edits.                                                                                                                                                                                                                                                                             |
| Authentication    | Pi resolves summarisation authentication inside the default summariser, after hooks, so summaries from hooks skip it.                                                                                                                                                                                                                                                                                                                                                                                |
| Stored OAuth      | In Pi 1.5.1 to 1.6.0, native summaries in SDK and CLI sessions send no pre-resolved credentials, so the model runtime uses a stored OAuth login. A rule that sets only `thinkingLevel` replaces the session stream and hides Pi's mark, so the replacement clears the pre-resolved key, headers, and environment unless the original stream is pi-ai's `streamSimple`. An SDK host with its own stream function then gets no pre-resolved credentials for these summaries, where Pi would pass them. |
| Not a transaction | The temporary metadata wrapper has the [session-write and cancellation limits](../README.md#side-effects).                                                                                                                                                                                                                                                                                                                                                                                           |
| Codex output cap  | In Pi 1.6.0, Codex summary requests send that output limit as `max_output_tokens`, raised to at least `MIN_OUTPUT_TOKENS` (16), unless the model sets `compat.supportsMaxOutputTokens: false` (`openai-codex-responses.js` in pi-ai). Up to Pi 1.5.2, Codex sent no output limit.                                                                                                                                                                                                                    |
| Dropped reasoning | In Pi 1.6.0, pi-ai records OpenAI's `prefix_mismatch` reasoning removals as an `openai_input_transformations` diagnostic (`appendReasoningRemovals` in `openai-responses-shared.js`), and interactive mode turns it into the notice (`REASONING_DROP_DIAGNOSTICS` in `interactive-mode.js`) that [other behaviour](requests.md#other-behaviour) describes. The extension builds post-compaction context as native compaction does, so it neither causes nor avoids the drop.                         |
| Late patches      | Fingerprint checks don't inspect overrides on session instances, and don't detect patches installed after binding. Combinations of third-party patches and reloads aren't guaranteed to work.                                                                                                                                                                                                                                                                                                        |

## Replacement opportunities

No public API in Pi 1.6.0 keeps all the features of any private hook below, so every hook stays. `session_before_compact` can cancel or replace a summary but can't change its instructions or model, and `compaction.modelOverrides` sets only token budgets.

| Private hook                                                                        | Features that depend on it                                                                 | Parity  | Public API Pi would need                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `_compactBeforeNextAssistantResponse` (prototype)                                   | `compact` tool requests at the between-response boundary, and their status messages        | None    | A request for native compaction before the next response, with instructions and outcome, that doesn't abort the run |
| `_runDefaultCompaction` (prototype), `agent.streamFunction` (instance, per attempt) | Summary-model and thinking routing, credential isolation, and metadata                     | None    | Native selection of the summary model and thinking level for default summaries, reported to the persistence step    |
| `_runAutoCompaction` and `compact` (prototype)                                      | Instruction-file focus for automatic and manual compaction                                 | None    | Extension-supplied instructions for every compaction route, seen by all `session_before_compact` handlers           |
| `_runDefaultCompaction` and `extensionRunner.emit` (instance, per attempt)          | Focus for automatic and tool-requested attempts, in summaries and `session_before_compact` | None    | The instruction API in the row above                                                                                |
| `sessionManager.appendCompaction` (instance, per attempt)                           | A metadata entry written before the compaction entry, after Pi's final abort check         | Partial | A summary-model field on the compaction entry, or a hook that writes before it                                      |
| `_appendCustomMessage` (called, not replaced)                                       | Status messages that reach the next request                                                | Partial | Immediate custom-message append between responses                                                                   |

- `session_compact` with `pi.appendEntry()` could save metadata, but only after the compaction entry, which would then stop being the leaf.
- `pi.sendMessage()` with `triggerTurn: false` still waits for the next `turn_end` while streaming, so the status would arrive after the response it explains.
