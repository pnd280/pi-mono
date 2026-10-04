# Tool-display test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md) · [Glossary](../GLOSSARY.md)

## Contracts

Tool interpretation, transcript grouping, and rendering must preserve the execution facts supplied by the host.

### Must not regress

These invariants protect settings trust, delegated execution, stored data, and ownership across transcript replacement.

Settings trust

- Untrusted project settings are excluded before validation, so an invalid untrusted section cannot disable display.
- An invalid global or trusted project section keeps original tool renderers and disables native observation, even if a later section overrides its values.
- Renderer overrides match exact tool names, including prototype-like names, before automatic adapter selection.
- Under automatic selection, tools without a verified adapter keep either supplied renderer slot, from their definition or a `registerToolRenderer` resolver, and receive generic cards only when neither slot exists. Unregistered tools always receive generic cards, so late registration can upgrade them, even when a resolver answers their name.

Execution and borrowed data

- Failures in observation callbacks or fact persistence do not replace a delegated tool result or error.
- Borrowed arguments, results, and messages remain unchanged during rendering, expansion, and row reuse.
- Native observation requires an interactive TUI binding, verified native provenance, and selection of the specialised native adapter.
- Observed native calls retain their construction settings, including the shell path and command prefix.
- Display integration preserves tool parameter schemas.
- Display integration preserves results produced through Pi's middleware.
- Display integration registers no tools.
- Display integration leaves the active tool selection unchanged.
- File mutation observation uses the shared capture rather than rereading targets for display.

Saved history

- New `pi-tool-display.facts` entries contain bounded operation, cancellation, patch, and saved-output reference facts rather than result bodies, images, styled text, or live shell previews.
- Display facts use custom session entries rather than model-context messages.
- Records exceeding the whole-record byte limit are rejected, including when unknown fields cause the excess.
- Replay restores matching recorded facts without rerunning tools or observing source mutations again; eligible expanded cards may still read saved output.
- Historical calls with missing results do not animate as pending live calls.

Reload and disposal

- Reload and removal restore only hooks and definitions still owned by this extension, preserving wrappers installed later.
- Disposing display observation leaves other mutation subscribers active.
- Retained observation callbacks cannot update calls or persist facts after their display session is disposed.
- Pending host-event continuations cannot reattach assistant decoration after disposal.
- Pending host-event continuations cannot take row ownership from a replacement transcript binding.
- Compaction notices are assigned to the current transcript binding after host handling, including when successful compaction reconstructs the transcript.

### Interpreting calls

Sources of truth

- Interpret only published data and validated adapter facts.
- Never recover omitted output from metadata, and never infer cancellation from prose. Text that only looks like a notice stays source text.
- Specialize only verified native and extension contracts.

Outcomes

- Rank outcomes as cancellation, then failure, then unavailable metadata.
- Ignore adapter outcomes for partial results.
- Resolve grouping and summary identities against the session cwd.
- A republished result object refreshes interpretation, even when its identity is unchanged.

Adapter failures

- A throwing callback used by the current interpretation or presentation switches the call or row to generic rendering and reports the adapter.
- Groups, outcomes, and summary identities agree on the fallback whatever the callback order.
- After a presentation failure, the call stays generic through later updates and keeps owner-level summary omission.
- Standalone cards skip CLI-only recognition, grouping, and run-summary callbacks. Used metadata callbacks can recover on a new snapshot; presentation failures stay generic. See [custom-adapter callback lifetimes](renderers.md#custom-adapters).

Paths

- Native and selective-read paths that differ only by Unicode space characters share headings, exploration groups, and summary identities, with latest-outcome replacement.
- Custom paths, FFF filters, search patterns, and borrowed arguments keep their original values.

Native read recovery notices

- Compact cards and groups keep recognised native read continuation notices and byte-limit recovery notices, including values from fractional and negative native read windows. Expansion shows one copy.
- Embedded lookalikes stay source text. Byte-identical native notices keep the documented provenance limit.

### Adapters

Each adapter falls back to generic rendering for invalid or partial contracts, without claiming unrelated tools. FFF scopes and diagnostics, MCP routing, media, and error identity, todo snapshots, and selective-read preview provenance have adapter-specific rules in each adapter's README.

Selective read

- The producer's [result contract](../../pi-read/docs/result.md) owns preview provenance, native source windows, and highlight coordinates. This package tests recognition, rejection policy, argument normalisation, diagnostic presentation, grouping, and installed-CLI integration through that contract.
- Recognition uses the shared projected schema without integer bounds.
- Installed-CLI coverage loads the real extension, so fixture drift cannot hide a schema incompatibility.
- Unknown top-level read arguments do not force generic cards or lose grouping, read summary items, or selection presentation. Retained arguments stay unchanged.
- Invalid known fields and unknown selection fields still fall back.

Pi's built-in codemode

- Render highlighted script previews and nested calls from validated details.
- Hide only the result header of the first block.
- Count each script once.
- The install suite loads `builtin:codemode` to cover real provenance, nested mutations, and parent-only replay.

Pi's built-in MCP and tool search

- Require built-in source paths and compatible parameter schemas, and respect renderer overrides.
- MCP headings keep the resolved server and tool identity, even for empty results. Without details, they keep Pi's name.
- Real offline MCP discovery keeps selection and original identities for normalized namespaces and collision-suffixed names. Deferred exposure does not disable the adapter.
- Tool search derives loaded-tool summaries only from validated details, hides raw parameters by default, and restores the original text on expansion.
- Ordered MCP media facts contain MIME labels only. Pi retains image bytes and rendering.

Smart compact

- Distinguish requesting compaction from completing it.
- Keep the instruction focus without showing raw parameters by default.
- Label only valid saved model and thinking selections; never infer them from current settings.
- Hide only the recognised successful acknowledgement that the heading already represents. Other text, errors, and partial results stay unchanged.
- Context-window cards summarise the supplied token, capacity, and percentage facts. They never calculate missing values or treat unknown usage as zero. Expansion restores raw output.
- Collapsed rendering, expanded rendering, and reused rows do not keep stale facts.

### Transcript structure

A _run_ is the sequence of this extension's calls between visible boundaries; see the [glossary](../GLOSSARY.md#transcript-structure).

Exploration groups

- Group adjacent compatible scopes in source order, not by tool name alone.
- Visible transcript boundaries split groups. Hidden completed thinking can merge them.
- Streaming, finalized content, and late adapters can regroup calls without duplicating members or changing unrelated expansion state.

Runs

- Visible assistant prose, unrelated messages, and unowned tools split runs. Exploration scopes do not.
- Thinking creates only group boundaries. Streaming indicators, completion, global toggles, and per-block clicks never settle, split, or reopen a run. This holds during replay too.
- Explicitly opened runs stay open.
- A boundary owner can change kind or withdraw without deleting another owner's boundary or a permanent notice.

Extension notifications

- Public extension notifications split groups and runs only when Pi inserts visible components.
- Notification arguments, return values, and no-op behaviour are preserved.
- Pi's thinking-toggle status messages don't split runs.
- Withdrawing an assistant boundary keeps the opened state of every contributing run, and an explicit collapse still works afterwards.

Nested-instruction notices

- Render through the producer's public contract, without loading its discovery factory.
- Join the preceding run in source order and stay exploration-group boundaries.
- Validated details add separate counts for loaded files, updated files, and removed directories. Counts deduplicate per action by persisted identity and never inherit tool outcomes. Invalid details add no counts.
- Omitting a call from the summary doesn't omit its notices.
- New notices refresh summary leaders and collapse controls. Notices follow their anchors when run boundaries change.
- Live notices don't settle runs. Ended runs hide their notices without margins and restore them when opened.
- A trailing notice owns the bottom collapse control. Clicking a notice doesn't expand the preceding group.
- Standalone notices and unrelated visible messages keep their boundary behaviour.
- Cover live messages, appended entries, and replay.
- Retired version-1 instruction notices remain ordinary message content; only the producer's current contract supplies structured recognition and counts.

### Modes

- Display mode changes survive transcript reconstruction and extension reload, without writing settings or history.
- `collapsedMode` selects the startup mode and the target of programmatic collapse from verbose. **Ctrl+O** follows the fixed cycle.
- A collapse request in `summary` or `compact` leaves the mode unchanged. Pi's header and resources change expansion only when crossing the verbose boundary.

### Summary lines

Settlement

- Only ended runs collapse. A run renders compact cards until no member is live and a non-thinking boundary or agent end closes it.
- Summaries need fullscreen. Regular mode renders `summary` as `compact`, and its cycle skips the identical step.
- Run splits, merges, repeated results, and settlement keep liveness correct.

Counting and layout

- Count files and directories once per category by latest outcome. Count other included calls individually.
- Order items by first call or notice, and never reorder them for failures. Keep the case of tool names.
- Indent every row two columns, with no leading marker. Wrap only between items, within the remaining width.

Work reuse

- Appending history and previewing live calls never scan completed run members.
- Unchanged summary and control checks reuse summary work. Membership, interpreted inputs, republished results, and notices refresh it.
- Collapsed summaries never prepare the card content they replace.
- Hidden members and empty summaries render no rows, images, or margins.

Opened runs

- Opened runs show compact cards until a mode change or a click on either collapse control.
- Plain full-width rules enclose opened single-card and grouped runs, with one blank row of inner padding at each end, including below native images.
- Rules and their padding share the collapse hitbox and never toggle cards.
- Footer clicks account for joined margins and image rows. Image clicks are unhandled and leave cards and runs unchanged.
- Live runs and empty-summary runs have no controls.
- An unrecognised row contract keeps Pi's chrome and disables summaries.
- Test layouts through `layoutRow` and click intent through `activate`. Keep only a few full-stack row tests.

### Assistant prose and thinking

Assistant prose

- Mark assistant prose blocks with `•` and a width-bounded hanging indent, during streaming and replay.
- Keep native Markdown, transformers, and borrowed messages unchanged. Don't mark user text, thinking, or diagnostics.
- Unchanged redraws reuse the decoration without rescanning Markdown rows. Width and content updates and invalidation refresh it.
- Invalidation and thinking toggles never duplicate markers. Removal restores native rows. Unverified assistant layouts stay untouched.

Collapsed thinking

- Hide collapsed thinking when its block completes, not when the message completes, in regular and fullscreen modes.
- Keep active thinking visible when shared partials expose later blocks, including consecutive thinking blocks sharing one placeholder.
- Ended placeholders stay hidden through prose and tool streaming, toggles, and invalidation.
- Message completion and abort clean up remaining placeholders, without changing source messages or leaking completion state to later messages.

### Cards

Diagnostics and images

- Diagnostics and images stay with their source call and stay visible when compact text is hidden, as the [README](../README.md#usage) states.
- Native image previews share the card's body indent and collapsed group guide, fit the remaining width, and keep Pi's protocol commands and reserved rows.
- Adapter-supplied nested calls stay visible on compact successful reads.
- Errors, cancellations, unavailable outcomes, and success stay distinguishable.
- Expansion restores retained content, never invented history.

Nested-instruction notice cards

- Render status and path headers with `•` collapsed and `▾` expanded.
- Expand to Markdown without repeating the model-facing preamble or changing stored content.
- Header clicks affect only that notice and survive redraws. Global expansion changes take precedence. Body selection and scrolling are not intercepted.
- Headers stay flush left regardless of tool-output padding, with bold accent actions and normal-foreground paths.
- Expanded paths wrap beneath themselves with a continuation guide. Result-tree children follow the header without a spacer.
- Narrow widths, Unicode, and control characters stay readable.
- Saved messages keep this presentation through reload. Removing the display extension restores Pi's default rendering while discovery stays loaded.

Pending markers

- Pending card and group markers flash between their glyph (`•` collapsed, `▾` expanded) and a same-width blank, without changing the rest of the heading or body.
- Completed markers stay visible. Standalone renderers without an animation clock keep pending markers visible.
- Animation redraws never prepare unchanged headings or bodies again, or serialize arguments again.

Call and result slots

- Renderer call and result slots share current call facts, including in reused rows.
- Standalone renderers skip grouping and run-summary work while refreshing both retained slots' outcomes and MCP identity on updates and invalidation.
- Refresh on updates and theme invalidation. Don't prepare hidden or unbounded bodies during redraw.
- Parameters follow adapter policy and settings, and keep routing and path summaries.
- Compact generic parameter serialization stops before omitted values, with depth and visit budgets for nested or omitted properties.
- Compact literal heading parts and source-code previews are bounded before normalization, without splitting graphemes at the source limit.
- Expansion restores complete retained values.

Labels

- Custom action and group labels become single-line terminal-safe text before layout.
- Narrow titled groups keep every outcome badge.
- Owner-level summary omission survives generic card fallback, without interpreting unsupported result facts. Other fallback calls keep generic counts.

Diffs and previews

- Diff, shell preview, and omission rendering preserve source text and mark generated annotations as distinct.
- Diff unavailability distinguishes queue overload and worker failure from per-diff work limits.
- Compact budgets keep meaningful changes and both ends of long targets.
- Invalid or oversized patch candidates keep published output alongside the limitation notice.
- A usable published or observed patch still replaces successful result text.

### Saved history and output

Replay

- Replay only matching calls and adapters on the selected branch. Recorded cancellation survives adapter changes.
- After late registration selects a verified adapter, restore its matching saved facts and apply the normal saved-preview eligibility rules. Never observe historical tools or persist new facts during this update.
- Associate calls by timestamp, content index, and tool-call ID across appends, branch changes, and resets. Distinct calls with equal timestamps stay distinct.

Saved-output reads

- Start reads only for eligible expanded completed calls.
- Enforce byte and line budgets independently, keeping useful head and tail content.
- Bound loads and cache size. After saturation, retry on re-expansion.
- Reject completions for obsolete paths or disposed sessions, without losing published failures.
- Clear old previews before telling rows about replacement paths, including saved-output facts.
- Remove obsolete saturation notices while retries are pending.
- Eviction cancels pending publication of that preview, including cache hits racing a replacement completion. Re-expansion can load a fresh preview.

Real host

- The API fixture exercises host reconstruction, compaction, expansion, mouse routing, and thinking integration.
- The installed-CLI fixture checks bundled hook fingerprints, assistant presentation, selective-read recognition, and bounded patch workers.

## Coverage boundaries

Unit coverage is limited to [Must not regress](#must-not-regress). Other contracts guide real-host, process, filesystem, and manual checks.

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). This package tests its adapters, display policy, transcript state, its use of Pi's private APIs, and the wiring of shared budgets. Performance assertions bound repeated work instead of requiring a particular internal call sequence.

| Suite               | Covers                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| Installed-CLI smoke | Extension loading, native read errors and images, mutation and resume. |
| Host and transcript | The resulting display behaviour.                                       |
| Manual              | The full visual scenario matrix; see [validation](validation.md).      |

## Exclusions

- No paid or live MCP or FFF search requests.
- No upstream tool execution matrices or native persistence internals.
- Full ANSI snapshots and colour-only permutations don't replace checks of visible lifecycle and content contracts.
- Terminal image protocols, drag selection, visual themes, and platform-specific shell behaviour need [manual checks](validation.md). Headless render assertions don't establish them.
