# Foreign transcript viewer

[pi-tool-display](../README.md)

Use `pi-tool-display/viewer` to display a supplied session through the same adapters, grouping, summaries, and row layout as the main transcript. Assistant prose keeps its `•` marker and two-column continuation indent. Recorded manual shell commands keep Pi's native cards, output, and outcomes, outside tool runs. Importing this subpath installs no hooks and loads no child extensions.

## Source ownership

For files, read their bytes, call Pi's `parseSessionEntries`, and create an in-memory snapshot. Do not call `SessionManager.open` on another session's file: loading can migrate and rewrite it. Source subscriptions, authoritative refreshes, and connection-generation checks belong to the caller.

## Model and component

1. Create a model with `createTranscriptModel({ sessionId, cwd, entries, leafId }, options)`. Supply append-ordered entries and the explicit active leaf. The model copies entries before passing them to Pi's in-memory session manager.
2. Pass public `JsonAgentSessionEvent` values to `model.event(event)`. RPC deltas are provisional; refresh ordinary entries with RPC `get_entries` and call `model.replace(snapshot)`. An `entry_appended` event alone does not supply all messages or establish the active branch.
3. Create a component with `createTranscriptViewer(model, { ui, theme, cwd, fullscreen, requestRender, action })`. Mounting, scrolling, focus, **Esc**, and local mode shortcuts belong to the caller. Use `viewer.setMode("summary" | "compact" | "verbose")` for local changes.
4. Dispose the viewer when its view closes, and the model when its source closes. Keep both across a presentation-only remount. Disposal is idempotent.

## Live and historical snapshots

Preparing calls follow the [foreign-viewer limits](../README.md#known-limits). The [collector](../src/host/collection.ts) captures adapter selection at `message_end`, and the [publisher](../src/transcript/publisher.ts) ties it to a saved assistant entry. The [wire model](../src/viewer/wire.ts) replaces empty arguments at `toolcall_end`; it does not apply `toolcall_delta` events.

Replacement snapshots preserve the selected mode and explicit expansion choices. Committed results supersede provisional execution events even when a context edit removes a result from the active conversation.

For live viewing, create an empty model as soon as the session ID is known and pass events immediately, including while a snapshot refresh is pending. An execution event can wait for its source call to appear. Once matched, its timestamp stays fixed, so the event cannot attach to a reused call ID with a different timestamp.

After `agent_settled`, unfinished calls remain unavailable across refreshes and later turns; partial output remains visible without implying completion.

Set `historical: true` for a stopped checkpoint: replacement clears running state, provisional messages, and execution updates even when entry IDs match. It also disables the saved-output loader.

## Caller capabilities

The optional model `readSavedOutput(path)` callback supplies bounded saved-output previews. Without it, expanded cards retain the saved Pi result and report unavailable referenced output. The model never reads mutation targets.

Same-machine callers can pass the exported `readSavedOutput` function to use the main transcript's bounded file-preview policy. Only expansion requests invoke that capability.

The optional viewer `action` callback receives a pure `{ event, data }` descriptor. The mounting host dispatches it and rechecks ownership. Summary-line clicks open runs before individual card actions become available.

The viewer cannot read the host's registered message renderers. Pass the optional `messageRenderers` map, keyed by `customType`, to render displayed custom messages as the main chat does. Messages without a renderer use Pi's default box.

## Evidence and summaries

Recorded contracts must match the supplied session identity, the source message entry ID, timestamp, content index and tool-call ID, and a supported adapter version. Missing or inconsistent provenance gives generic cards. An original extension renderer becomes an explicitly unavailable generic card, retaining its run exclusion and boundaries. Historical calls without terminal evidence remain unavailable. A recorded cancellation establishes the outcome even when no tool result was saved.

Facts that name a source message entry cannot attach to a different entry, even if the timestamp, content index and tool-call ID match. The fact cache also uses source-entry identity.

After confirming a cancelled child's exit, a supervisor can use `persistDisplayFact(append, call, adapter, fact)` to retain a bounded cancellation fact in a new owned checkpoint. Match the source call and exclude completed or unobserved historical calls. The supplied appender must not write to the child's source session.

`summarizeRun(model, record, liveIdentity?)` returns validated structured segments and a sanitised single-line `text`, bounded to 2 KiB. Omitted data has an incomplete marker. Supply `{ sessionId, generation }` from the current connection when using a record for live activity; earlier generations remain usable for historical replay within the same session.

Final run records are immutable. Use their entry IDs for completed-run digest cursors; progress revisions do not represent additional digest items. The viewer selects the active branch. Branch-bound digests must use only the selected ancestry for items, cursors, and usage.
