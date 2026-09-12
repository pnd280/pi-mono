# Codex tool-card parity decisions

This log retains the pre-implementation decisions and audit chronology. See [implementation status](#implementation-status) for the delivered design and verification; earlier future-tense descriptions record the state when those decisions were made.

## Reference and goal

- Source of truth: [Codex TUI tool display - implementation reference](codex-tui-tool-cards.md). Markdown is canonical; the HTML edition is a companion reference.
- Target Codex commit: `121f91fd5d9dc66017866ce9bdc49f1e182721df`.
- Audited host: Pi `0.85.1`.
- Target package: [`pi-tool-display`](../../packages/extensions/pi-tool-display/README.md).
- Goal: use Codex as the reference for tool-card layout, grouping, family-specific presentation, and lifecycle behavior, with Pi's active theme supplying colors and code highlighting. Literal one-to-one visual matching is not required. Identify remaining functional differences and inherited Pi limitations explicitly.

## Confirmed decisions

Numbers refer to the original audit's limitations/blockers, not a separate decision count. All six behavioral directions and all six pre-implementation recommendations are agreed. The configuration shape, loading behavior, initial integrations, metadata opt-outs, collapsed failure visibility, and oversized-content policy are settled. The blocker review additionally approves native tool reconstruction for TUI-only observation, excludes user-entered shell commands, and requires activity animation. Sessions created outside the TUI must still reconstruct cards from their retained calls and results when opened interactively. Adapter interfaces and persisted metadata schemas remain engineering design work, not unresolved user-facing decisions.

### Audit #1: Expand beyond individual tool-call rows

The user approved expanding the package's scope beyond its existing individual-row restriction.

The design includes cross-call exploration grouping, compact/detailed projections through Pi's native expansion, and activity animation. The existing package constraints must not rule out those capabilities merely because they require coordination outside one row.

User-entered `!` and `!!` shell commands are outside this implementation. Leave their execution, rendering, animation, expansion, cancellation, and model-context inclusion unchanged. Do not add `You ran` cards, observe their operations, or include them in exploration groups. This supersedes the initial permission to include user-shell displays.

This decision approves the scope expansion. Subsequent sections record the coordinator and metadata decisions; additional host integration and metadata schemas remain to be designed. The package's broader scope restrictions in `AGENTS.md` still need to be updated.

#### Terminal behavior boundaries

HTML export is not required for terminal-card parity. The presence of an HTML reference edition does not make session HTML export part of this work.

Pi supplies bounded streaming snapshots. Continue replacing previews with the latest supplied snapshot and replacing partial output with the authoritative final result; do not concatenate snapshots as though they were deltas. Scope expansion does not itself require separate image-byte retention.

#### Decision-log convention

Record decisions here as the discussion proceeds. Keep confirmed decisions distinct from unresolved questions. Do not modify the source-of-truth report to record implementation choices.

### Audit #2: Use a dedicated local transcript coordinator

The user approved a dedicated coordinator module within `pi-tool-display`, initially at `packages/extensions/pi-tool-display/src/transcript-coordinator.ts`.

Separate grouping, call identity, lifecycle state, and replay reconstruction from Pi event/private-hook adapters and family-specific rendering. Exact host integration and expansion/image ownership remain open.

Keep the module local for now. A future subagent activity view or alternative transcript browser could motivate extracting shared coordination into `packages/libs/`, but neither is a current consumer. Extract the common contract when a concrete consumer needs it; do not create a shared package solely for hypothetical reuse.

#### Activity animation

Animate active tool cards and exploration groups using Pi's theme colors and one coordinator-owned scheduler. Animate only known live activity; completed and historically reconstructed cards stay still. Stop the scheduler when no live activity remains and dispose it with the integration. Exact Codex palette-dependent shimmer is not required. Animation does not establish an execution outcome or supply missing operation timing.

### Audit #3: Save display metadata and reuse Pi's temporary output files

The user agreed to save the extra display information and accept that full output depends on Pi's temporary files. Exact adapter implementations and the metadata schema remain to be designed.

#### Execution-time observation

Capture missing display facts through tool-owner adapters that delegate the owner's execution implementation and operations. Preserve tool parameters, prompts, model-visible output, errors, cancellation, settings, and mutation ordering. For verified CLI-native tools, the user approved reconstruction with Pi's factories as described below; preserving the existing execution closure is no longer required for this observation path.

Observation follows the selected renderer. `original` skips this extension's grouping and extra display-metadata capture for future calls. `generic` uses supplied arguments/results without specialized diff observation. Automatically selected specialized cards capture the additional facts they need. Changing modes never removes already-saved metadata or changes Pi's own records.

- **Shell:** Pi exposes `BashOperations.exec`, returning `exitCode` and streaming real output chunks through `onData`. Observe operation start/end and returned exit codes; classify abort/timeout from the operation's outcome rather than parsing the rendered command output. Forward chunks unchanged to Pi. The timer would measure the delegated operation, not time since the row first rendered. Pi's failed shell calls throw instead of returning final details, so capture metadata independently of successful returns.
- **Live output:** Exact Codex head/tail retention requires observing actual output chunks before Pi truncates them. A bounded Codex-style live buffer in the adapter could supply replacement preview snapshots to the coordinator. This is distinct from concatenating Pi's overlapping snapshots, which remains incorrect. The latest authoritative final output replaces the live preview.
- **Edits:** Reuse final `details.patch`. A proposed patch shown before mutation needs an adapter around Pi's actual read/write operations; arguments alone do not establish the exact normalized result or validated match. Track proposed changes separately from the application outcome so retained patch history can follow Codex's start/failure behavior.
- **Writes:** Observe the previous regular-file contents immediately before writing, inside Pi's existing mutation queue, and compare them with the actual submitted content. Record creation only when absence is established. Persist the resulting display change, not a second complete copy of every file. If observation is unavailable, keep the operation's original behavior and mark the display information unavailable. External writers can still race with observation; Pi's queue only coordinates its own file mutations.
- **MCP/custom tools:** Their owners must provide server/tool identity, typed display content, and the distinction between a transport error and a returned error result when their Pi projection loses those facts. Generic text and `isError` cannot reliably reconstruct that distinction. Do not duplicate image bytes in display metadata.

#### Native tool reconstruction: approved exception

Pi 0.85.1's [shell](../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js), [edit](../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/edit.js), and [write](../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/write.js) factories capture their operation callbacks in execution closures. Those callbacks are not exposed on the resulting definitions. The existing render-definition lookup can change presentation but cannot attach an observer inside an already-created execution closure.

The user selected **B: recreate verified CLI-native tools with Pi's own factories and observation-enabled operations**. This enables operation-level shell metadata, a bounded live output buffer, and write/edit observation inside Pi's existing mutation queue.

```text
Pi factory + observation-enabled operations
  → new native execution closure
    → observer delegates the operation
      → Pi receives unchanged operation output
      → coordinator receives extra display facts
```

This is a narrow exception for execution-time observation, not permission to register replacement tools solely for presentation. Execution-closure identity changes; preserve native schemas, prompt metadata, ownership, settings, active-tool selection, and model-visible execution behavior. Keep the display lookup render-only. Do not recreate third-party or SDK definitions automatically, including tools with built-in names or an SDK `builtin` source label; their owners must opt into observation through an explicit integration.

The native binding, configuration propagation, and restoration mechanism remain engineering design work. Keep that private host integration isolated and reversible, preserve later wrappers, and verify behavioral equivalence rather than claiming it from factory reuse alone. No Pi core or installed dependency edits are permitted.

#### TUI-only observation and later replay

The user selected **Q4 A: automatic observation only in interactive TUI mode**, including regular and fullscreen rendering. Do not automatically reconstruct native execution definitions, perform observation reads, write extra display session entries, or run activity animation for print, JSON, or RPC calls. Explicit tool-owner integrations remain separate; SDK-owned tools and user-entered shell commands remain outside automatic native reconstruction.

A session created outside the TUI can still display reconstructed cards when opened interactively. Pi persists tool calls and results independently of this extension's observation. Rebuild presentation from the available session records under the current renderer policy; do not require extra display metadata for basic cards or exploration grouping where the tool contract is established.

```text
Print / JSON / RPC tool execution
  → Pi saves calls and results, without automatic display observation
  → session opened later in the TUI
    → reconstruct cards and eligible exploration groups
    → expand retained arguments, paths, and output
```

Retained results supply text/images, recorded success/failure, and native edit patches when present. Available saved-output references can supply additional output under the existing bounded-loading policy. Missing historical tool definitions use generic cards. Unrecorded operation durations, exact shell exit codes, write before-states, and lost typed metadata remain unavailable; reconstructing a card does not recover those facts.

Replay must not rerun tools or start activity animation. New tool calls made after interactive resume can capture display metadata normally. This remains an implementation requirement, not evidence that broader replay and grouping support is already implemented.

#### Persistence and saved output

Persist additional display facts in namespaced Pi custom session entries associated with the call ID and session branch. Pi's public `appendEntry` persists these entries without sending them to the model. Reuse existing result details and argument content rather than duplicating them. Keep metadata collection/persistence failures from converting a successful tool operation into a reported failure.

For finalized output exceeding Pi's retained result, use its existing `fullOutputPath` when available. Read saved output outside synchronous rendering and avoid loading an unbounded file into memory. When a saved file exceeds the display budget, show bounded head/tail text with an omission notice and the file path. A missing, inaccessible, or incomplete saved file means only retained output is available; do not present that as a complete transcript. Failure paths need to preserve a saved-output reference from supplied updates because final exceptions do not return details.

Reuse Pi's existing temporary output files; do not create a separate durable full-output archive. When those files disappear, only session-retained output remains. Treat this as an accepted, inherited Pi limitation. Loading available saved output is an extension feature; Pi's normal card expansion does not automatically read those files.

#### Observable effects and remaining limits

This approach adds execution-time observation, extra file reads for write diffs, a bounded shell preview buffer, saved-output reads, and session entries containing display metadata and any otherwise-missing patch text. Deleted/context lines from overwritten files could therefore be retained in session history where Pi's ordinary write result did not retain them.

If previous-file observation or diff computation exceeds its budget, mark the diff unavailable and let the original write proceed rather than doing unbounded display work. Never present incomplete changes as a complete diff. Concrete output, observation, and computation budgets will be chosen, documented, and tested during implementation; they are not additional configuration fields in the initial implementation.

Existing sessions cannot recover unrecorded durations, exact exit codes, previous file contents, or lost MCP types. Display only established facts; do not reread today's file to invent a historical before-state or parse arbitrary output as authoritative metadata.

### Audit #4: Map Codex color roles to Pi's active theme

The user clarified that literal one-to-one visual matching is unnecessary and requested mapping Codex colors to Pi theme variables. Preserve Codex's layout and behavior while using Pi's theme colors and existing code highlighting. Both the cards and the surrounding interface follow the selected Pi theme; do not change that theme globally.

#### Theme mapping

Use semantic roles rather than replacing every occurrence of a particular color. Initial mapping:

```text
Successful call marker   → success
Failed call marker       → error
Operation label / accent → accent
Tool heading             → toolTitle
Tool output              → toolOutput
Secondary text           → muted
Quiet marker / gutter    → dim
Added diff lines         → toolDiffAdded
Removed diff lines       → toolDiffRemoved
Unchanged diff lines     → toolDiffContext
Code tokens              → Pi highlighter / syntax* tokens
```

These are Pi's existing theme color tokens; themes can resolve them through their own `vars`. No new required theme tokens are needed. Exact diff-background choices remain a styling detail: Pi has no dedicated added/deleted diff-background tokens, so use suitable existing colors or omit the tint rather than requiring Codex's palette.

#### Rendering implications

- Retain family-specific status and emphasis rules. A completed exploration heading remains quiet rather than being styled as an ordinary successful shell call. Add a short failure/cancellation count beneath the summary when supported by available metadata; individual diagnostics remain in expansion. This is an agreed behavior difference from Codex, whose collapsed exploration summary hides individual failures.
- Keep bold/dim emphasis separate from color selection. Pi's `dim` color token is not itself the terminal DIM modifier; exact Codex modifier emission is not a requirement.
- Preserve colors supplied by shell output where appropriate instead of recoloring them through the semantic mapping. Parse supported styling without forwarding arbitrary cursor or screen-control sequences. Raw projections remain unstyled.
- Reuse Pi's existing code highlighter. There is no requirement to reproduce Syntect token boundaries, bundle Codex's syntax themes, add a Codex-specific highlighter dependency, or duplicate its palette detection solely for visual matching.
- Keep Codex-style diff structure, including headings, line numbering, and hunk presentation. Reusing Pi's colors and highlighting does not require adopting Pi's entire diff layout.
- Resolve colors from the current theme and refresh rendered rows when it changes. Persist display facts, not theme-specific ANSI strings.

Byte-for-byte ANSI output, exact RGB values, and Codex terminal-writer quirks are outside the visual target. Host behavior and interaction differences remain part of audit #5.

### Audit #5: Use Pi's existing expansion and host rendering

The user agreed to stick with Pi's defaults: use native expansion, scrolling, keybindings, and image rendering without adding a separate transcript/raw browser.

#### Compact and detailed views

Use Pi's normal conversation view for grouped, compact tool summaries. Use its existing tool-output expansion to show original calls individually with their arguments, full paths, and available output. Collapsing restores the grouped summary without discarding calls or results.

```text
Collapsed
• Explored
  └ Read a.ts, b.ts

Expanded
• Read a.ts
  └ [available file contents]

• Read b.ts
  └ [available file contents]
```

Pi already supplies global expansion state and an expansion action, plus per-row mouse expansion in fullscreen mode. The coordinator must connect group expansion to its member rows and invalidate affected displays. Global expansion should affect all groups; clicking a group in fullscreen mode should affect that group. Hidden sibling rows must not leave repeated blank gaps or duplicate their details.

This supplies compact and detailed tool views within Pi's normal scrolling interface. Use Pi expansion instead of Codex's separate transcript pager. Do not add a separate fullscreen transcript/raw browser or a new raw-view shortcut.

#### Mouse support

The user explicitly requested mouse support for tool cards and exploration groups.

- In fullscreen mode, left-clicking a group toggles its compact/detailed view and synchronizes all member calls. Ungrouped cards retain Pi's native click-to-expand behavior.
- Mouse and keyboard actions update the same expansion state. Keep hit regions aligned with the visible rows after scrolling, resizing, and regrouping.
- Preserve Pi's wheel scrolling, drag-to-select behavior, and link-click priority. Handle expansion clicks without swallowing unrelated pointer events or adding new mouse gestures.
- Keep regular mode unchanged: the terminal owns mouse input, and Pi's keyboard expansion remains available.

Verified in Pi 0.85.1's installed TUI documentation and implementation:

- `@earendil-works/pi-tui` exports optional component `handleMouse(event)` handling and a `MouseRegion` wrapper. Normalized events include press, release, click, move, drag, and wheel, with component-local cell coordinates, buttons, and modifiers.
- Mouse events are routed in fullscreen mode. Regular mode does not capture them because the terminal owns its scrollback and selection. Do not enable mouse capture in regular mode or change the user's renderer mode.
- Pi's `ToolExecutionComponent` already wraps call/result components in `MouseRegion`. A left click toggles row expansion once a result exists. A child component's handled event takes precedence over the wrapper's handler.
- Reuse this native event routing; do not add a raw mouse-protocol parser. The coordinator still needs to synchronize group members when expansion changes. Keyboard expansion remains available in both modes.

#### Keys, images, and terminal width

- Keep Pi's existing bindings and respect user remapping. By default, `Ctrl+O` expands tools and `Ctrl+T` toggles thinking. Do not take over `Ctrl+T` to imitate Codex. Hints should use Pi's actual configured expansion binding.
- Keep Pi responsible for rendering images and honoring its image settings. Grouping must leave each image visible once; an image-producing call must not disappear because its text row was grouped. Exact image placement need not reproduce Codex's separate image-notice cells.
- Wrap long commands, paths, and output to Pi's permitted row width. Do not reproduce Codex's oversized logical rows or terminal-writer quirks. Preserve source text for detailed inspection and rewrapping after resize.
- Keep useful separation between visible cards, while removing per-call gaps from hidden group members. Literal blank-row matching is not required.
- Detailed output follows audit #3: load available Pi temporary output files outside synchronous rendering and show retained output when those files are unavailable.

### Audit #6: Tool coverage and optional generic overrides

The user agreed to automatic coverage for tools without custom renderers, preservation of existing custom tool UIs by default, and an optional per-tool override to the generic card using Pi's supplied arguments and results.

#### Coverage

```text
Pi-owned built-in              → specialized card
Tool with an explicit adapter  → specialized card supported by that adapter
Other tool without custom UI   → generic name / arguments / result card
Other tool with custom UI      → preserve by default; allow explicit replacement
```

Automatically cover Pi-owned built-ins. Extend basic display coverage to ordinary custom/MCP tools that have no owner-supplied renderers. Preserve an extension's existing `renderCall`/`renderResult` implementation unless the user, its owner, or an explicit integration selects this display instead. Replacing a custom renderer can remove interactions or domain-specific information even when execution stays unchanged.

Generic cards can show tool identity, supplied arguments, text/image results, and known success/failure. They should not infer read/search semantics from a name or assume every extension tool is MCP. Exploration grouping and specialized summaries require a known contract or explicit adapter.

Include specialized adapters for search tools owned by the official `@ff-labs/pi-fff` package in this implementation, verifying owner and argument/result contracts rather than broadly matching names. `pi-fff-guard` already recognizes that owner but is not a display adapter. Other custom/MCP tools follow the generic/original policy unless an explicit owner integration supplies a specialized contract. Do not add new plan, collaboration, or approval interfaces solely because they appear in the Codex reference.

Rich MCP rendering still depends on audit #3's owner-provided metadata: server/tool identity, typed content, and transport-error versus returned-error distinctions cannot be reconstructed reliably from flattened text. Basic automatic coverage does not promise missing protocol information.

#### Optional replacement of custom renderers

Allow selected custom renderers to be replaced with generic cards without requiring a specialized adapter.

Pi already supplies the arguments, result `content`, arbitrary result `details`, and rendering status separately from the renderer. Feed those inputs directly into the selected renderer; do not scrape the original renderer's output. Custom renderer callbacks return TUI components whose `render(width)` method produces terminal strings, not a standard structured card model.

Provide a per-tool choice to preserve the original renderer or replace it with the generic card. Generic replacement does not change tool execution. The agreed namespace and override values are specified in the configuration section below.

Generic rendering should use standard inputs, text/image content, and known status. Arbitrary `details` fields have no common meaning and should not be dumped indiscriminately. A specialized adapter is needed to interpret tool-specific fields or replace a custom interaction. Information held only in a renderer's internal state is not reliably available for reuse unless its owner exposes it.

#### Registration and replay

Pi's extension API lists tool metadata but has no public arbitrary-tool renderer replacement API. The existing private render-definition lookup hook is a possible integration point for additional tool names, covering both live creation and reconstructed history. Keep it isolated and reversible, and preserve later wrappers.

Use the original owner's definition to determine whether custom renderers exist, before Pi adds built-in renderer defaults by tool name. Change the definition supplied to the display, not the unknown tool's execution registration. Do not replace a third-party or SDK tool with a local built-in just because it is named `read` or `bash`; preserve schemas, execution, tool ownership, and the active tool list. Execution-time metadata adapters remain separate from this display selection.

Provide an explicit integration entry point for tool owners and SDK hosts, evolving the current renderer factory as needed. Reconstruct displays from available session records; when a historical tool definition is unavailable, use a generic display of retained data without recreating or executing the missing tool.

## Configuration

The user selected the literal top-level key `ext.pi-tool-display` and string values `original`, `generic`, and `auto` for `rendererOverrides`, preferring explicit modes that can be extended later. Boolean values are not part of the chosen shape. The current extension has no extension-specific settings yet; this interface is not implemented.

### Settings shape

Use an `ext.pi-tool-display` section in Pi's existing settings files: the global `settings.json` in Pi's configured agent directory (normally `~/.pi/agent/settings.json`), and `.pi/settings.json` for trusted projects.

```json
{
  "ext.pi-tool-display": {
    "rendererOverrides": {
      "search_docs": "generic",
      "deployment_status": "original"
    }
  }
}
```

The tool names above are examples. Keys match exact registered tool names, not labels or patterns. Values:

- `generic`: use this extension's generic name/arguments/result card, even when the tool supplies a custom renderer. Use supplied call/result data without specialized diff observation.
- `original`: retain the tool's original renderer, or Pi's default when none is supplied. Skip this extension's exploration grouping and extra display-metadata capture for future calls.
- `auto`: apply the agreed coverage policy. This also allows a project to reset an inherited override for a specific tool.

Missing settings mean an empty override map and automatic selection for every tool. An override changes presentation and related display observation; it does not enable or disable tools or select a different execution implementation. Specialized native observation may use a new execution closure under audit #3's approved reconstruction exception; `original` and `generic` do not require that reconstruction. Rules for currently unavailable tools remain inactive so global configuration can cover different projects. Already-saved session metadata remains untouched when modes change.

### Loading behavior

- Defaults apply first, followed by global settings, then trusted project settings.
- Merge `rendererOverrides` by tool name; a project entry replaces the global value for that tool. An omitted project entry inherits the global value. An explicit project `auto` restores automatic selection for that tool; an empty project map does not erase global entries.
- Read configuration on startup and `/reload`; do not add a file watcher or automatically rewrite settings files.
- Reject invalid display configuration as a whole rather than applying only valid entries. Warn with the source file and invalid key, and preserve original renderers without disabling tools. Valid overrides naming currently unavailable tools are not configuration errors.
- Reuse Pi's theme, expansion, image, keyboard, and mouse behavior. The initial configuration adds no duplicate settings for those features and no CLI/environment aliases.

Pi preserves additional settings keys, and `SettingsManager` exposes global/project settings for extension-side validation. This section would be owned by `pi-tool-display`; it is not an existing core Pi setting or a new `/settings` entry supplied automatically by Pi.

### Other contracts to define

The tool-owner adapter API and session metadata record format remain engineering design work under the agreed ownership, execution, persistence, and replay constraints. Exact internal types and record field names do not themselves require another product decision. Confirmed user-visible consequences and integration scope are recorded in the audit and configuration sections above.

## Pre-implementation review

The user accepted all six recommendations: settings loading, whole-configuration validation, official FFF integration, mode-dependent metadata capture, visible collapsed failure/cancellation counts, and bounded output/diff handling. These product decisions are incorporated above under their original audit topics. The broader redesign has not started.

The completed initial refactor covers built-in presentation only. External-tool coverage, metadata adapters, new configuration, grouping, and tool management were outside this refactor; the broader roadmap decisions remain unchanged.

### Built-in display integration: completed

- The initial `installBuiltinDisplays()` lookup (now superseded by [src/host-integration.ts](../../packages/extensions/pi-tool-display/src/host-integration.ts)) wrapped the private `InteractiveMode.prototype.getRegisteredToolDefinition` lookup and supplies display-only definition copies for live and historical built-in cards. [src/index.ts](../../packages/extensions/pi-tool-display/src/index.ts) installs it before history reconstruction. Shutdown, reload, and non-TUI cleanup remain reversible and preserve later wrappers.
- Removed `registerBuiltinDisplays()`, `src/builtins.ts`, active-tool writes, and execution-settings reconstruction. Automatic presentation no longer calls `registerTool()` or `setActiveTools()`. Pi retains its native definitions and configured execution. The renderer factory and card presentation are unchanged.
- Automatic eligibility remains limited to known built-in names and CLI built-in provenance. External owners, including tools with built-in names, keep their renderers. SDK base-tool overrides can also carry `builtin`; the label alone does not establish native ownership, and SDK hosts must continue using explicit renderer integration.
- Unavailable installation warns and keeps original rendering. Decoration failures return the available previous view. A failing previous lookup propagates without retry.
- Package documentation and code navigation now describe the private lookup as the sole automatic integration.

Verification against Pi **0.85.1**:

- `vpr 'pi-tool-display#format' --check`, `vpr 'pi-tool-display#check'`, and `vpr 'pi-tool-display#test'` passed: **4 files / 23 tests**. Host-boundary tests cover unchanged definitions, execution/schema identity, prompt metadata, ownership, active tools, configured shell behavior, results/updates, errors/cancellation, two reloads, expansion, removal, non-TUI cleanup, external rendering, unavailable installation, decoration failures, and repeated wrapper disposal. Existing renderer/layout tests remain unchanged.
- Disposable tmux TUI checks passed for native write/read/edit/shell calls, failed calls, two `/reload` cycles, new calls after reload, `/new` followed by `/resume`, expansion after resume, and settings-based extension removal followed by reload. Ownership stayed `builtin` and active tools stayed `read, bash, edit, write`; default live/historical rendering returned on removal. Narrow-width reflow, theme changes, truncation notices, and cancellation were also checked.
- The TUI used a local scripted provider to issue real native tool calls without network requests or model charges. No paid-provider calls, fullscreen mouse interactions, inline-image checks, or Windows/PowerShell execution were performed. The built-in refactor's live TUI checks were completed; this does not establish broader Codex parity.

## Implementation status

The [implementation plan](implementation-plan.md) is implemented in the workspace extension and the new shared [pi-utils](../../packages/utils/README.md) package. The canonical Codex reference and its HTML companion preserve the pinned analysis; source-navigation notes distinguish it from the delivered implementation.

- [Host integration](../../packages/extensions/pi-tool-display/src/host-integration.ts) replaces `replay.ts`. The render-only lookup and row/reconstruction hooks are separate from native construction before Pi middleware wrapping. Inspected Pi 0.85.1 construction-method fingerprints cover its bundled executable and unbundled API, rejecting unknown prior wrappers; SDK overrides are not native evidence. Restoration preserves later owners/wrappers.
- The local coordinator owns ordered groups, live/historical lifecycle, native expansion/click synchronization, and one 600 ms scheduler. Images stay Pi-owned; unsupported protocols retain image notices. Generic/original overrides bypass specialized observation, and invalid applicable settings preserve original views.
- Version-1 `pi-tool-display.facts` records reference source message entry/timestamp/content position, call ID, and adapter. Reconstruction reads selected ancestry without publishing facts to model context or rerunning operations. Proposed changes and operation outcomes remain distinct from final published results.
- Native factories supply call-scoped shell/edit/write observations. Saved-output loading uses Pi's temporary files, with bounded reads/cache and disposal checks. [Resource budgets and observable effects](../../packages/extensions/pi-tool-display/README.md#observation-and-saved-history) are now concrete, including persisted deleted/context lines.
- [Renderer integration](../../packages/extensions/pi-tool-display/docs/renderers.md) now uses explicit adapter objects, unified `details.patch`, official FFF provenance/contracts, and owner-supplied MCP facts. Implicit built-in-name selection and numbered-diff interpretation are removed.

[Validation evidence](../../packages/extensions/pi-tool-display/docs/validation.md#recorded-implementation-evidence) records the affected package suites, scoped static checks, and offline regular/fullscreen TUI checks. Those checks include reload/resume/new/fork/tree/compaction/removal and reopening print/JSON/RPC histories with no non-TUI observations. Native active selection and ownership stayed unchanged.

A follow-up using the published `pi` executable caught native fallback that the initial unbundled-entry-point checks missed. The executable now has a regression check. Actual FFF find/grep calls also exposed compact count/spacing and late-registration replay issues; compact diagnostics and historical regrouping now preserve the intended presentation.

Remaining inherited limits are temporary-file availability, external filesystem races, and facts absent from old sessions. Visible terminal-image rendering, link/drag/clipboard interactions, user-shell failure/cancellation, and Windows/PowerShell execution were not manually verified. Portable contracts and native component tests are not evidence of those platform interactions.

## Implementation boundary

Changes belong in workspace extensions and their supporting packages. Do not edit Pi core or installed dependencies. The built-in private lookup and its lifecycle are implemented and verified above. Additional private integration for grouping, external tools, and native execution observation remains to be designed and must stay isolated and reversible. Native reconstruction is limited to audit #3's TUI-only observation exception. Print, JSON, and RPC execution remains unchanged; later TUI reconstruction uses its retained records. User-entered `!` and `!!` shell commands remain entirely outside this work.

## Implementation order

See the [implementation plan](implementation-plan.md) for module responsibilities, dependencies, implementation tasks, and acceptance checks.

The confirmed choices above define this sequence; the blocker review's product decisions are settled. The focused built-in display refactor is complete; broader adapter and metadata work remains separate.

- **Built-in display integration - completed:** The existing private lookup supplies live and historical built-in cards without presentation-only registration. Current rendering and native execution preservation are verified above.
- **Foundation:** Update the package constraints to reflect the agreed scope and define the shared call/metadata model and adapter contracts within the extension.
- **Grouped exploration:** Build the local coordinator and connect grouped reads/searches/lists to live rows and session reconstruction. Integrate native expansion, fullscreen mouse handling, image ownership, and the shared activity scheduler before extending the remaining renderers.
- **Metadata and output:** Bind observation-enabled native definitions under the approved reconstruction exception. Add session persistence, write/edit change information, and asynchronous access to Pi's saved output.
- **Card rendering and coverage:** Complete family-specific labels, layout, previews, and diffs using Pi's theme. Add automatic generic rendering and per-tool overrides while preserving tool execution and owner-supplied UIs by default.
- **Verification and documentation:** Update affected tests and package documentation. Check grouping, reload/resume/branching, expansion, mouse selection/links, narrow widths, theme changes, errors, cancellation, and missing saved-output files through focused tests and live terminal checks. Verify reconstructed native execution behavior, animation shutdown and replay inactivity, unchanged user-entered shell behavior, and the absence of automatic observation in print/JSON/RPC runs. Resume sessions from those modes in the TUI and verify cards and eligible groups reconstruct from retained data without rerunning tools or fabricating metadata.

## Remaining implementation details

- **Audit #2 - Coordinator integration:** Connect grouped presentation and completion to Pi's host rows, expansion, and image ownership. Define reconstruction during reload, resume, and branch navigation without replayed execution events. Activity animation is required; its shared scheduler and invalidation mechanism remain to be implemented.
- **Audit #3 - Metadata integration:** Define the native reconstruction binding and restoration mechanism, adapter interfaces, session record schema and branch association, saved-output loading, and handling of unavailable metadata. TUI-only native reconstruction for observation, persistence of extra display facts, and reliance on Pi's temporary output files are agreed. Later TUI reconstruction of non-TUI sessions must work without extra display metadata.
- **Audit #4 - Styling integration:** Finalize diff-background mapping and theme-change invalidation. Mapping semantic colors to Pi's active theme and reusing its code highlighter are agreed; literal Codex color/highlighter matching is not required.
- **Audit #5 - Native host integration:** Implement synchronized group expansion, explicitly requested fullscreen mouse support, image ownership, and width-bounded rendering. Preserve native scrolling, selection, and link handling. Pi's default interaction model is agreed; no separate transcript/raw browser is needed.
- **Audit #6 - Tool coverage integration:** Implement the agreed settings loading and validation, official FFF adapters, owner integration entry points, and display-only lookup changes for live and replayed tools. Coverage, preservation, the `ext.pi-tool-display` namespace, and string-valued renderer overrides are agreed. There is no public arbitrary-tool renderer registry.
- **Verification - Conformance evidence:** Select source-backed text/style cases and live terminal checks. Passing the current package tests establishes its existing behavior, not Codex parity.

## Screenshot observations: completed reads

The user supplied `/tmp/pi-clipboard-d5de9f33-dcda-4a37-a9bc-fa1401d4b11d.png`, showing four completed read calls in the current implementation.

- Each read occupies a separate card rather than joining an exploration summary.
- Every read repeats a returned-line count and `ctrl+o to expand` hint, adding a second row and repeated instructional text to the compact view.
- The installed-package read displays its entire absolute path. That machine-specific prefix dominates the row even though the filename is the useful summary label.
- Accent color covers the full path, while `Read` is the bold heading. The target puts the exploration state in the heading, accents the operation label, and leaves the file names in ordinary text.
- Per-card spacing compounds the extra result rows. These four reads can occupy two rows at the supplied width when summarized together.

Reference-based compact target for this example:

```text
• Explored
  └ Read implementation-decisions.md, themes.md, verification.md, development.md
```

Use Pi theme colors for this hierarchy. Keep full paths and retained outputs available in the detailed transcript. These observations concern the displayed completed reads; the screenshot does not establish streaming, replay, or resize behavior.

## Audit facts affecting implementation

- Successful Pi edits already return `details.patch`, a unified patch. The extension currently ignores it and renders `details.diff`. Final edit-diff rendering does not require a filesystem reread.
- Pi writes return no previous file content or creation-versus-overwrite metadata. Submitted content alone cannot establish an accurate before/after diff.
- Pi shell results are bounded to 2,000 lines / 50 KiB. Renderers cannot recover discarded bytes from those results alone. The agreed approach reads Pi's saved-output files when available and accepts missing files as an inherited host limitation.
- Pi's renderer context has no structured exit code, duration, abort reason, replay flag, or sibling ownership reference. Its execution-start flag also covers preflight, not just a running subprocess. The shell operations API does expose exit codes and raw data callbacks, so execution-time observation can capture facts that the renderer alone cannot obtain.
- Pi's `appendEntry` stores extension-specific session entries outside model context. This provides a public persistence route without changing model-visible tool results.
- Pi's write operations callback runs inside its per-file mutation queue, providing an observation point immediately before the delegated write. It does not protect against concurrent external processes.
- The built-in private lookup supplies live and historical rendering without changing execution registrations. It does not provide grouped transcript ownership or access to operation callbacks captured inside native execution closures. Shell/edit/write observation requires factory-time operation injection under the approved native reconstruction exception.
- User-entered `!` and `!!` commands use `BashExecutionComponent`, not the tool-definition display lookup. That separate display and execution path remains unchanged.
- The reference is based on source and committed fixtures, not a live Codex capture. Terminal appearance remains environment-dependent.
