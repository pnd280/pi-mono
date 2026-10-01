# Compaction test coverage for maintainers

[pi-smart-compact](../README.md) · [Compatibility and terms](pi-compatibility.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). This package tests its tools, settings, native routing, and session persistence.

## Must not regress

Compaction requests must preserve credential isolation, session ownership, and the distinction between cancellation and failure.

### Model and credential isolation

- No model or thinking override ever changes the conversation model or its thinking level.
- A configured model uses its own provider authentication: key, headers, environment, and base URL.
- Failures to look up, authenticate, or generate with the selected model never fall back to the active model.
- Focus and model routing never leak into a concurrent operation with a different abort signal.

### Session isolation and cleanup

- Requests are isolated per session. Settlement, disposal, or abort never carries a request into another run.
- Temporary summarizer, event, and stream wrappers deactivate after every outcome.
- Cleanup restores original identity and property ownership only for hooks the extension still owns.
- The shared boundary is restored after its last owner exits, unless another patch has replaced it. It rejects unsupported implementations and conflicting ownership.
- Event listeners for outcomes are released on every exit. Disposing a binding during an attempt prevents late outcome publication.

### Failure and abort

- A reported failure or cancellation of a requested compaction leaves the old context intact.
- An actual abort prevents another request to the main model.
- Unexpected native exceptions propagate, without a status message.

## Tools

`context_window` reports usage; `compact` schedules an attempt after the tool batch finishes.

### `context_window`

- `context_window({})` reads `getContextUsage()` from the execution context without compacting.
- Model-facing JSON and structured details preserve native values: no extra fields, no rounding, and `null` stays `null`.
- An `undefined` result returns `Context usage unavailable.` with undefined details.
- Nested tools can call it.

### `compact`

- Only the model can call `compact` directly; nested execution cannot schedule it. Check this through a real model-issued tool context, not an unbound runner.
- `compact({ instructions? })` requests one operation. The acknowledgement the model reads is always `Compaction requested.`
- Unconfigured calls have `{ scheduled: true }` details.
- With model overrides, details also include `modelOverride` and `thinkingLevel`, which `pi-tool-display` shows for information only.
- The thinking level is the configured one, or else the session's current level. Non-reasoning models default to `off`.
- Saved acknowledgements keep the configuration from request time.
- Duplicate requests merge into one, and the last request's focus wins.

## Compaction outcomes

| Outcome          | Expect                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success          | Native compaction entry and summary only. No success status is emitted, saved, or added to context.                                                                 |
| Skipped          | One saved, visible `pi-smart-compact.result` message with the reason, before the next model response. The request is consumed and temporary overrides are restored. |
| Cancelled        | One saved, visible status message before the next model response.                                                                                                   |
| Failed           | One saved, visible status message with the error before the next model response.                                                                                    |
| No outcome event | A neutral explanation, not a claim that the session was too small.                                                                                                  |

- No request means no status message. Duplicate requests produce at most one.
- Status messages survive context rebuilding, and never add user prompts or request another turn.
- Requested compaction stays inside the active run: no extra user prompt, early idle resolution, duplicate start or settlement, or premature exit in print mode.
- Native reasons are `manual`, including retries and failures. Success updates the next model request and saves native usage and file metadata.

## Summary-model metadata

- Each successful default summary (tool, manual, threshold, or overflow) saves one `pi-smart-compact.model` custom entry directly before its compaction entry.
- The entry records the selected summary `provider/model-id`, its input thinking level captured before asynchronous routing or generation, and the trigger. Physical virtual-model routing does not replace those facts.
- The entry never reaches model context, and the compaction entry stays the branch leaf.
- No entry is saved for unrelated summary calls, summaries supplied by hooks, summarisation failures, or cancellations before native persistence.
- Changing the thinking level during generation does not change the recorded level.
- Every binding supplies the metadata writer. The persistence wrapper waits for native `appendCompaction`, after Pi's final abort check. It deactivates on persistence, abort, terminal compaction events, or binding disposal, and leaves later replacements alone.
- Rendering ignores malformed stored data and sanitises model identifiers for terminal display, without changing what is stored.

## Footer status

- When `ctx.hasUI` is true, `ctx.ui.setStatus` publishes a dim `compacted N×` under `pi-smart-compact.compactions`, where N counts compaction entries on the active branch. It is cleared at zero.
- It refreshes on session start, `session_compact`, `session_tree`, `turn_start`, and `agent_settled`, and is cleared at shutdown.
- Compactions proposed at a boundary are counted at the next turn or final settlement, after they are saved.
- Skipped, cancelled, and failed attempts add no entry and leave the count unchanged.
- RPC publishes the same status through the client's UI protocol.

## Settings

Read global and trusted current-project settings without writing them, then load only the selected instruction file.

### Reading

- Global settings merge field by field with cwd settings, and only in trusted projects.
- Absent fields keep native model and thinking selection.
- Invalid participating files or values, and unknown extension keys, fail closed.
- Reads are limited to 1 MiB. Settings are never written, and parent directories are never searched.

### Instruction file

- `instructionsFile` accepts nonempty paths and expands `~/`. Relative paths resolve from the directory of the settings file that declares them.
- At startup or reload, only the winning merged path is read. Inherited paths keep their global origin.
- The loaded policy contains the file's text, not its path. Scope-aware resolution and file I/O stay inside the loader.
- Missing, non-regular, unreadable, and oversized files fail initialisation.
- A BOM and outer whitespace are trimmed. Empty files add no focus and keep native selection without replacing even a read-only stream.

## Routing

Model overrides apply only to the requested native operation. File focus applies to every compaction route.

### Between responses

- A session with no pending request follows Pi's original boundary between responses.
- Explicit requests ignore the threshold and enabled checks, but keep the current model's compaction settings and complete tool-batch persistence.

### Configured summary model

- A configured model handles the tool's default history and split-turn summaries, including native retries.
- It uses its own output cap, and keeps native provider retry limits and request and connection timeouts. That includes provider-timeout precedence and disabled HTTP idle timeouts.
- Native `before_provider_headers` handlers can add or remove headers for the selected provider after authentication, once per summary attempt, retries included.
- Explicit thinking overrides apply only to the native operation. Unsupported levels fail.
- Overrides never change model selection for manual or automatic compaction that hasn't opted in, unrelated model requests, or summaries supplied by hooks.

### Virtual models

Use a real non-interactive SDK session and an offline router whose returned physical level differs from both the configured and the conversation levels. Thinking overrides must reach the router before dispatch, for a configured summary model and for a selected virtual conversation model.

| Case                     | Expect                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted route           | One direct route with the owning signal, the physical output cap, metadata for the selected model and level, and unchanged conversation state. |
| Rejected route           | No provider request is dispatched.                                                                                                             |
| Cancelled during routing | Cancellation reaches the owning signal.                                                                                                        |

Rejected and cancelled routes leave context and branch entries unchanged, restore the stream, and clear native compaction activity.

### `applyToManual` and `applyToAuto`

| Setting                            | Expect                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `applyToManual` omitted or `false` | `/compact` model and thinking selection is unchanged.                                                                              |
| `applyToManual: true`              | Configured model and thinking apply to native `/compact`, RPC, and SDK manual summaries. Instructions and lifecycle are unchanged. |
| `applyToAuto` omitted or `false`   | Threshold and overflow selection is unchanged.                                                                                     |
| `applyToAuto: true`                | Configured model and thinking apply to both automatic reasons. Hooks and lifecycle are unchanged.                                  |

Edge cases:

- `applyToAuto` never routes tool requests or `/compact`, and `applyToManual` never routes automatic summaries.
- Without file focus, either flag alone leaves summaries and the stream untouched, including a read-only stream. Tool requests with only the flags set and no instructions also use the native path.
- An unavailable model fails the automatic attempt, with no fallback and no compaction entry. Native recovery edits are not undone.

### Focus

- Default summaries of history only, prefix only, and both receive focus exactly once.
- File focus applies to tool, manual, threshold, and overflow attempts, whatever the model opt-ins say. It comes before per-call focus rather than replacing it.
- Without file focus, omitted or empty instructions add no focus. Empty per-call instructions do not clear file focus.
- Real retries reuse the unmodified original request.
- Hooks see the same focus, and can cancel or replace native summarisation.

## Where each layer is tested

| Layer                        | Covers                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration and unit tests | Bounded settings reads limited to trusted scopes, instruction-file resolution, inheritance and reload, one-shot request isolation, aborts, swallowed preparation errors, and hook ownership. Invalid configuration fails closed without changing native compaction.                                                                                               |
| CLI subprocess tests         | Run against the installed CLI. Provider requests, event order, next-response context, and reopened session files. Credential and header isolation, retries and timeouts, split-turn and history focus, cancellation and failure, metadata placement, no redundant success notice, and saved non-success status, in text and JSON modes.                           |
| Real API and SDK host        | API fingerprints, `context_window` usage, session replacement and reload, model switches, selected-provider routing, and reentrant requests. Native entry points tell manual, threshold, overflow, and tool requests apart. Hook cancellation and custom summaries, output caps, restoration after every outcome, and native selection when settings are removed. |
| Print-mode SDK policy tests  | Real model-issued tool exposure and asynchronous virtual routing, using a small session fixture without a terminal, theme, viewport, or interactive runtime. The fixture isolates credentials and settings, emits shutdown, disposes the session, and restores its environment.                                                                                   |
| Footer tests                 | Counts from committed branch entries, and cleanup across navigation, reload, and shutdown.                                                                                                                                                                                                                                                                        |
| Renderer tests               | Malformed metadata and terminal-control safety.                                                                                                                                                                                                                                                                                                                   |

Use offline providers and disposable workspaces in the system temporary directory. Never depend on personal settings, credentials, or network calls to providers.

## Not covered automatically

- Tests show that prompts and lifecycle are handled, not that a real model follows the instructions.
- Footer and renderer tests do not establish RPC display or terminal appearance.
- Print-mode SDK policy tests do not exercise interactive mounting or UI transport. Footer status has its own tests.
- Automatic routing tests call native entry points directly. They do not exercise threshold detection or the full overflow retry scheduler.
- Pi owns summarisation and provider behaviour. Tests protect this extension's boundaries rather than duplicating native coverage.

Check these manually, as described in the [compatibility checklist](pi-compatibility.md): interactive progress, **Escape** behaviour, real-provider quality, and concurrent third-party patches.

Run the [validation commands](../README.md#validation).
