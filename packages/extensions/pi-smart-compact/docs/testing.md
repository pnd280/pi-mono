# Testing specification

[pi-smart-compact](../README.md)

## Observable contracts

- `context_window({})` reads the execution context's `getContextUsage()` without initiating compaction. Its model-facing JSON and structured details preserve the native object without added fields, rounding, or replacement of `null`. An `undefined` result produces `Context usage unavailable.` with undefined details.
- `compact({ instructions? })` requests a one-shot operation, not a completed result. Requests are isolated by session; duplicates coalesce with last-request-wins focus, and settlement/disposal/abort cannot leak them into another run.
- Successful compaction uses the native compaction entry and summary only: no extra success message is emitted, persisted, or added to model context. Skipped attempts (with reason), reported cancellations, and reported failures (with error) produce one persisted, visible `smart-compaction-result` message before any next model response. No request means no status message; duplicate requests produce at most one. Status messages survive context rebuilding without adding user prompts or requesting another turn.
- An untouched session follows Pi's original boundary. Explicit requests bypass threshold/enable checks but preserve current-model budgets and complete tool-batch persistence.
- Default history-only, prefix-only, and mixed summaries receive focus exactly once. Omitted/empty instructions add no focus. Real retries reuse an unmodified original request. Hooks see the same focus and can cancel or replace native summarization.
- Compaction remains inside the active run: no extra user prompt, early idle resolution, duplicate start/settlement, or premature print exit. Native reasons are `manual`, including retries and failures. Success updates the next model request and saves native usage/file metadata.
- Reported failure/cancellation leaves old context intact. Actual abort prevents another main-model request. Skipped compaction still consumes its request and restores temporary overrides. A native attempt returning without an outcome event gets a neutral explanation, not an unsupported diagnosis that the session was too small.
- Unexpected native exceptions propagate without a status message. Outcome event listeners are released on every exit; disposing a binding during an attempt prevents late outcome publication.
- Temporary summarizer, event, and stream wrappers deactivate after all outcomes; cleanup restores original identity/property ownership only for hooks still owned. The shared boundary restores after its final owner exits unless replaced by another patch, and rejects unsupported implementations or conflicting ownership.

## Coverage boundaries

- Unit tests exercise request isolation, one-shot consumption, explicit clearing, signal/run aborts, swallowed native preparation errors, unexpected native exceptions, duplicate bindings, compatibility rejection, and boundary ownership restoration.
- Bundled CLI subprocess tests inspect provider requests, event traces, next-response context, and reopened session files. They cover text/JSON continuation, all summary shapes, retries, empty focus, custom summaries, hook/compaction-only cancellation, failure, abort, duplicate requests, and too-small contexts. Successful attempts must have no extra status message in events, model context, or the reopened session. For non-success attempts, the status must persist in the reopened session and appear in any subsequent provider request; native message events must publish it before any final response.
- A real API/SDK host verifies `context_window` registration and execution across session replacement/reload. Controlled native usage results cover unchanged numeric values, null usage, and unavailable usage. It also verifies compaction, continuation, native summary visibility without a redundant success notice in a later user-requested turn, fresh-session replacement, extension reload, and final boundary cleanup. A reentrant summary with a different abort signal must receive no injected focus even while a native summary is in progress. It independently exercises the API-module fingerprints rather than the bundled CLI implementation.
- Fixtures use offline providers and disposable system-temp workspaces. No personal settings or credentials are used; no provider network calls are made. Tests check prompt plumbing and lifecycle, not whether a real model follows instructions faithfully.

## Manual checks and exclusions

Interactive progress rendering, Escape interaction, real-provider adherence/quality, and arbitrary third-party concurrent patch combinations require separate checks. The extension does not own Pi's summarization algorithm or provider behavior; tests protect adapter boundaries rather than duplicating native algorithm coverage.

Run [validation commands](../README.md#validation) and follow [workspace testing](../../../../docs/agents/testing.md).
