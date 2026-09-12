# pi-tool-display implementation plan

Implement the design confirmed in [implementation-decisions.md](implementation-decisions.md). Implementation evidence and remaining platform checks are recorded in the decision log's [implementation status](implementation-decisions.md#implementation-status).

Use the pinned [Codex implementation reference](codex-tui-tool-cards.md) for family behavior and layout, applying the decision log's Pi-specific differences. Target Pi **0.85.1** and the inspected official `@ff-labs/pi-fff` **0.10.6** contracts.

## Scope and dependencies

Deliver grouped exploration, native compact/detailed expansion, fullscreen mouse support, live activity animation, execution-time display facts, saved-output loading, family-specific cards, official FFF integration, generic coverage, and renderer overrides.

Automatic observation runs only in interactive TUI mode. Print, JSON, and RPC sessions must reconstruct cards from retained calls/results when opened later in the TUI. Leave user-entered `!`/`!!` commands unchanged. Do not add a transcript/raw browser, HTML export integration, new keybindings, a durable output archive, or Pi core/dependency edits.

```text
1. Contracts and settings
   ├── 2. Host integration → 3. Grouped exploration and interaction
   ├── 4. Metadata and saved output
   └── 6. FFF and owner adapters

2 + 4 → 5. Native execution observation
3 + 4 + 5 + 6 → 7. Family rendering and conformance
All → 8. Integrated verification and documentation
```

Resolve the private host integration in step 2 before building the remaining features around it. Steps 4 and 6 can then proceed independently of grouped presentation.

## Module boundaries

Keep coordination local to `pi-tool-display`. Reuse Pi's tool factories, mutation queue, theme/highlighter, width utilities, image components, mouse routing, settings, and session manager.

Proposed source layout, with colocated tests for behavioral modules:

```text
packages/extensions/pi-tool-display/src/
├── index.ts                   # Extension lifecycle and public event adapters
├── host-integration.ts        # Private lookup, row bindings, native binding/restoration
├── display-model.ts           # Call identity, lifecycle, facts, adapter contracts
├── settings.ts                # Validation, trusted loading, renderer selection
├── transcript-coordinator.ts  # Ordered calls, groups, expansion, replay, animation
├── adapters.ts                # Native/FFF interpretation and explicit owner integration
├── session-metadata.ts        # Display records, persistence, branch-aware reconstruction
├── native-observation.ts      # Factory-created native definitions and operation observers
├── output-buffer.ts           # Bounded observation of real shell chunks
├── saved-output.ts            # Asynchronous, bounded loading of Pi output files
├── diff.ts                    # Structured patch interpretation and change computation
├── presentation.ts            # Family summaries and compact/detailed projections
├── renderers.ts               # Pi components and public renderer factory
└── layout.ts                  # Terminal-safe styling, wrapping, and row budgets

packages/utils/src/fff-tools.ts # Shared pure FFF ownership/name classification
```

`host-integration.ts` supersedes `replay.ts`; move its tests and remove the old module and `installBuiltinDisplays()` entry point rather than retaining an alias. Keep rendering separate from filesystem work and execution. No renderer may start an observer, append a session entry, or run a tool.

The shared utility is justified by two concrete consumers: `pi-fff-guard` and `pi-tool-display`. Move only their common ownership/name classification there. Keep the guard's filesystem inspection and blocking policy in the guard, and all display state in the display extension.

## 1. Contracts and settings

**Files:** package `AGENTS.md`, `src/display-model.ts`, `src/settings.ts`, `src/adapters.ts`, and their tests.

1. Replace the package's obsolete individual-row/no-timer constraints with the confirmed coordinator, observation, and animation boundaries. Preserve the render-only lookup rule and explicitly separate the narrow native execution exception.
2. Define call identity using the session runtime, source assistant message/content position, and tool call ID. Preserve source order independently of execution completion order. Persist references that can survive branch navigation and session forks; do not use the latest leaf ID as an immutable branch identity.
3. Represent live versus historical origin separately from lifecycle and outcome. Distinguish argument preparation, queued/preflight activity, observed operation execution, final success/failure, established cancellation, and unavailable outcome. Missing timing is not a running-state predicate; missing results are not success.
4. Define adapter inputs from the original tool definition/provenance, supplied arguments/results, and optional owner-provided facts. Keep operation outcome separate from Pi's final published result, which may have passed through other extensions. Renderer selection must not rewrite either.
5. Implement the literal top-level `ext.pi-tool-display` settings section and `rendererOverrides` string values `auto`, `generic`, and `original`. Read global and trusted project settings through Pi's settings/trust APIs, using Pi's configured paths rather than a hardcoded home directory.
6. Validate each applicable source before merging overrides by exact tool name. Defaults precede global settings, then trusted project settings. Project `auto` resets an inherited choice; an empty map does not erase it. Reject invalid display configuration as a whole, warn with source/key, and use original rendering with no extra observation. Ignore untrusted project settings.
7. Load at startup and `/reload`, including before historical display selection. Do not introduce a watcher, settings writes, CLI flags, environment aliases, or duplicate Pi UI options.
8. Make selection explicit: `original` bypasses grouping and future metadata capture; `generic` uses supplied data without specialized observation; `auto` applies verified native or explicitly selected adapter coverage and otherwise preserves owner renderers or uses generic rendering. Determine owner renderers before Pi adds built-in defaults by name.

**Acceptance:** table-driven tests cover configuration precedence, invalid values/shapes, unavailable tool names, partial owner renderer slots, and metadata opt-outs. No arbitrary tool becomes a read/search/shell adapter merely because of its name.

## 2. Establish reversible host integration

**Depends on:** step 1.

**Files:** `src/index.ts`, replacement `src/host-integration.ts`, and the migrated `src/replay.test.ts` suite.

### Display and row bindings

- Retain `InteractiveMode.getRegisteredToolDefinition` as the display-only definition lookup. Inspect the underlying `session.getToolDefinition()` for original renderer ownership; call the previous lookup once and preserve its failures.
- Bind one coordinator to each participating TUI session. Install the lightweight hook before Pi reconstructs history; initialize settings and historical state before constructing decorated rows. A `session_start` handler alone is too late for initial/reload history.
- Use Pi's `renderSessionItems`/session reconstruction boundary to establish historical origin and source order. Bind live creation/update paths to the same identities. Keep private types and accesses confined to the host adapter.
- Establish row handles for expansion, invalidation, and disposal. Use `ToolExecutionComponent.setExpanded()` and its existing self-render behavior: empty text slots already emit no text separator, while Pi retains image ownership. Do not hide an entire image-bearing row to suppress its grouped text.
- Verify initial construction, `/reload`, `/resume`, `/new`, forks, tree navigation, and compaction rebuilds use current session/settings objects rather than captured old extension contexts.

### Native execution binding

- Use Pi's `_baseToolDefinitions` and `_refreshToolRegistry` boundary as the initial integration candidate. Pi's `_buildRuntime` reconstructs base definitions from settings; registry refresh then applies extension/SDK overrides and wraps execution. Insert observed native definitions before that wrapping, leaving the display lookup independent.
- Require a participating TUI session, verified native ownership, an eligible specialized renderer, and no SDK `_baseToolsOverride`. Reject third-party/SDK definitions even when they have built-in names or a `builtin` label. Do not automatically reconstruct unknown or previously modified native closures whose behavior cannot be established.
- Preserve source provenance, schemas, argument preparation, prompt contributions, active selection, tool filters, and Pi's extension execution middleware. Do not use `registerTool()` for presentation, write the active list directly, or bypass `tool_call`/`tool_result` handlers.
- Prove the binding with one factory-created native tool before adding full observation. Account for runtime rebuilding and dynamic registry changes, including tools registered during `session_start`.
- Keep original references and restore only definitions/hooks still owned by this integration. Later wrappers and owner replacements must survive disposal. Repeated install/dispose must be idempotent; a retained disposed wrapper must be inert.
- If the necessary private contract is unavailable, deactivate the affected integration and keep original execution/rendering as applicable. A working display lookup may still render retained facts without observation. Warn in the TUI rather than fabricating metadata or partially replacing execution.

**Acceptance:** extend the real Pi session/component tests rather than building a simulated registry. Establish unchanged behavior before/after binding, two reloads, removal, dynamic owner replacement, and later-wrapper disposal. Verify no automatic native binding or observation in print/JSON/RPC. Keep execution identity assertions for untouched tools and modes; use behavioral equivalence for the approved reconstructed closures.

## 3. Grouped exploration, expansion, and animation

**Depends on:** step 2; begin with native read/search/list calls using retained Pi data.

**Files:** `src/transcript-coordinator.ts`, `src/presentation.ts`, `src/renderers.ts`, and host row bindings.

- Build the coordinator as a state machine callable without a Pi session. Feed it ordered call/message facts and explicit live updates; rendering must not advance lifecycle or grouping.
- Derive exploration eligibility only from known contracts or explicit adapters. Preserve original calls, arguments, results, and order. Deduplicate names only in the compact summary of consecutive read-only calls, following the reference's [coalescing rules](codex-tui-tool-cards.md#exploration-classification-and-read-coalescing).
- Keep successful completed exploration joinable until the next semantic boundary. Ordinary tool cards, visible assistant/user content, and other transcript boundaries stop coalescing. Preserve source order across parallel completion and late updates; an orphan result must not attach to an unrelated running group.
- Keep a group active while a member is known live. Do not fail completed siblings when another call is blocked, cancelled, or fails. Show the agreed short failure/cancellation count beneath a completed summary when established; detailed diagnostics remain individually inspectable.
- Let the first member own compact group text. Suppress only redundant sibling text. Expansion reveals each original call, full paths, and available output; collapsing restores the same summary. Preserve Pi's inline images once, including images on otherwise hidden siblings.
- Synchronize Pi's global expansion with all groups and a fullscreen group click with that group's members. Use one expansion state per group, avoid recursive setter updates, and retain native behavior for ungrouped cards.
- Use native `MouseRegion`/component mouse routing. Preserve link priority, drag selection, wheel scrolling, and regular-mode terminal mouse ownership. Recompute hit regions after scrolling, resize, expansion, and regrouping.
- Implement one coordinator-owned animation scheduler, started only for known live participating activity. Use Pi theme colors and invalidate affected components through Pi. Stop when idle; historical/incomplete-history cards remain still. Dispose the scheduler and row subscriptions on shutdown/replacement. Do not animate by starting one timer per renderer.

Compact acceptance example:

```text
Read a.ts → Read b.ts → Read a.ts

• Explored
  └ Read a.ts, b.ts

Expand → all three original calls and their retained results
```

**Acceptance:** coordinator tests cover coalescing boundaries, source-order stability, overlapping success/failure, missing starts/results, group expansion, and reconstruction with no live events. Use a controlled clock for scheduler start/stop/disposal. Check actual regular/fullscreen TUI grouping, clicks, image visibility, and blank-row removal before extending other families.

## 4. Display metadata and saved-output loading

**Depends on:** step 1; integrate with steps 2 and 3 as they become available.

**Files:** `src/session-metadata.ts`, `src/saved-output.ts`, and reconstruction adapters.

### Persistence contract

- Define a namespaced, validated display record format with an initial schema version, originating call/message reference, adapter identity, fact kind, and explicit availability. Keep proposed file changes separate from application outcome.
- Persist only additional facts through `pi.appendEntry()`: operation timing/exit/cancellation facts, otherwise-missing change information, and saved-output references not retained in final results. Do not duplicate Pi arguments/results, image bytes, theme ANSI, or every live output update.
- Use bounded semantic records for a proposed change and terminal observation where needed. Write proposal information before the delegated mutation when retaining failed applications requires it. Do not let collection/serialization/persistence failures change the delegated operation's success, failure, or cancellation.
- Read metadata from the selected branch, including ancestor entries needed for calls retained through compaction. Materialize visible calls through Pi's compaction-aware session APIs. Do not merge metadata from unrelated branches or restore all pre-compaction calls into the visible transcript.
- Reconstruct without writing replacement metadata or replaying execution events. Handle absent, malformed, unsupported-version, duplicate, and partially persisted records conservatively. Missing metadata is a supported input, not a migration requirement. Do not add legacy aliases or speculative schema migrations.

### Saved output

- Load `fullOutputPath` asynchronously outside `render(width)`, retaining a supplied update's reference when a final exception loses its details. Interpret this field only for a verified contract or explicit owner integration.
- Define byte/line limits for reads and cached output. Use bounded head/tail access for oversized files, label omissions, and show the saved path. Do not read an entire unbounded file and truncate afterward.
- Deduplicate in-flight reads and bound cached data. Reject stale completions after session/branch changes or disposal. Clear session-scoped resources on teardown.
- Missing, unreadable, non-regular, or incomplete saved files fall back to Pi's retained text with a limitation notice. Valid oversized files use the bounded head/tail projection above; never claim it is complete or create a replacement archive.

**Acceptance:** real temporary-session/file tests establish persistence without model-context changes, branch/fork association, compaction retention, malformed/partial records, bounded reads, missing files, and stale asynchronous completion. A session containing only Pi calls/results reconstructs useful cards without any display entries.

## 5. Native execution observation

**Depends on:** steps 2 and 4.

**Files:** `src/native-observation.ts`, `src/output-buffer.ts`, `src/diff.ts`, and native binding tests.

Create observation-enabled definitions with Pi's factories and original settings. Give each execution a call-scoped observation context so operation callbacks without call IDs remain correctly associated under parallel execution. Do not use one mutable global/current-call variable.

### Shell

- Use `createBashToolDefinition()` with `createLocalBashOperations()` and the effective shell path/command prefix. Cover the corresponding PowerShell factory/backend without applying Bash-only settings to it. Preserve Pi's session environment, process-tree termination, timeout, signal, and update behavior.
- Measure operation start/end around the delegated `exec`, not renderer creation or preflight. Capture returned exit codes, including unknown/null exit, and established abort/timeout outcomes without parsing arbitrary output text. Do not invent exit zero from absent metadata.
- Forward each original `Buffer` to Pi unchanged. Observe the same bytes separately with incremental UTF-8 decoding and CRLF-aware line accounting. Keep a bounded head/tail live buffer based on the reference's [live retention](codex-tui-tool-cards.md#live-retention-and-authoritative-final-replacement); retain total-versus-stored counts and label byte/line omissions.
- Distinguish these real chunks from Pi's replacement snapshots. Final published results replace live previews, even if they differ from accumulated output. Late updates cannot reactivate completed calls.

### Edit and write

- Wrap Pi's actual edit read/write operations. Capture the bytes read and the validated content handed to `writeFile`, preserving native normalization and mutation ordering. Do not independently implement text matching or infer a validated edit from arguments.
- Use final native `details.patch` for successful edits. For a proposed change, derive a patch from the actual operation inputs before the write; retain it separately if application fails.
- For writes, read previous regular-file content immediately before the delegated write inside Pi's existing mutation queue. Record creation only when absence is established; unreadability is not absence. Compare against the actual submitted content. Do not queue the mutation a second time or reread today's file during replay.
- Reuse Pi's exported `generateUnifiedPatch()` where its resource behavior fits. Define observation byte/line limits, a diff computation budget, and highlighting limits before enabling capture. Enforce limits before whole-file allocation or expensive synchronous work; use cancellable computation if a helper cannot bound worst-case work. An exceeded budget yields unavailable display information while the original write proceeds.
- Preserve binary/non-regular/unreadable-file behavior, signal/error propagation, and concurrent mutation ordering. Release observed before-state after deriving bounded display facts; do not persist a second full file copy.

**Acceptance:** compare observed and ordinary native execution for parameters, prompts, settings, environment, content/details, updates, errors, cancellation, and filesystem results. Cover concurrent same-file edits/writes, symlink aliases, CRLF, no-change edits, failed matching/writes, unreadable before-state, budget boundaries, split UTF-8/CRLF chunks, and observation/persistence failure. Verify `original`/`generic` opt-outs and all non-TUI modes avoid extra observation reads/entries.

## 6. Official FFF and explicit owner integration

**Depends on:** step 1; connect to coordinator and persistence from steps 3 and 4.

**Files:** `src/adapters.ts`, public renderer exports/docs, `packages/utils/`, and the FFF guard's classifier consumer/tests.

1. Extract `fffAdapter()` ownership/name classification from `pi-fff-guard/src/index.ts` into a pure helper exported as `pi-utils/fff-tools`. Initialize the existing empty `packages/utils` directory as a workspace package with scoped scripts, exports, TypeScript configuration, README, and AGENTS. Update both consumers with `workspace:*` dependencies and the resulting lockfile changes. Keep guard blocking/search behavior unchanged.
2. Interpret the inspected official FFF contracts for `fffind`, `ffgrep`, enabled `fff-multi-grep`, and their recognized FFF-owned override names. Preserve search scope, patterns, exclusions, limits, and cursors in detailed arguments. Use declared result fields such as `totalMatched`, `totalFiles`, `pageIndex`, and `hasMore` only where that tool supplies them. Keep textual pagination/omission diagnostics available; do not treat a result count as proof of complete output.
3. Discover ownership per current registry state because FFF registers dynamically. Verify owner plus argument/result contract; leave unrecognized owners/contracts on the applicable original/generic path. Do not enable disabled FFF tools or invoke its search engine for display.
4. Connect the approved FFF integration through explicit adapter selection. FFF 0.10.6 supplies its own `renderCall`/`renderResult`; it is not a renderer-free generic tool. Preserve owner UI unless the override or explicit integration selects this display, and ensure `original` always bypasses the FFF display integration.
5. Evolve `createToolDisplayRenderers()` to take an explicit adapter contract where specialized interpretation is needed. Export that contract through `pi-tool-display/adapters` and retain the factory's `pi-tool-display/renderers` entry point. Remove implicit built-in-name inference for unknown custom tools and update all workspace usages/tests and `docs/renderers.md` together. Keep the SDK entry point independent of the private CLI hook and automatic native reconstruction.
6. Define explicit owner-supplied MCP facts for server/tool identity, typed content, and transport-error versus returned-error distinctions. Generic tools use only supplied arguments, text/images, and known status. Do not infer MCP identity from dotted names, scrape rendered components, or dump arbitrary `details`/base64.

**Acceptance:** shared classifier tests and both extension suites cover official/versioned/local provenance, lookalike names/owners, dynamic registration, disabled tools, partial custom-renderer slots, explicit overrides, and SDK definitions named like built-ins. Typed MCP fixtures distinguish transport failure, error-bearing results, multiple text/media blocks, and unavailable typed metadata. No new MCP transport is required.

## 7. Family-specific rendering and conformance

**Depends on:** steps 3 through 6.

**Files:** `src/presentation.ts`, `src/renderers.ts`, `src/layout.ts`, `src/diff.ts`, and focused existing suites.

- Replace the current one-row verb/result template with family-specific projections. Use the reference's [exec/exploration](codex-tui-tool-cards.md#exec-and-exploration), [MCP](codex-tui-tool-cards.md#mcp-calls), and [patch](codex-tui-tool-cards.md#patches-and-diffs) chapters, constrained by available facts and the agreed coverage.
- Exploration uses `Exploring`/`Explored`, quiet completed headings, accented operation labels, and ordinary filename text. Remove repeated successful-read line counts and per-read expansion hints from compact groups; keep full paths and results in expansion.
- Shell uses `Running`/`Ran`, outcome-colored completed markers, independent command/output gutters and budgets, and a bounded head/tail preview. Distinguish absent output from completed empty output. Put available timing/exit details in the detailed projection; keep expansion hints tied to Pi's configured action.
- Generic/typed invocation cards use `Calling`/`Called`, width-dependent invocation placement, and appropriate content-block projections. Preserve supplied diagnostics and media ordering. Do not apply a shell-wide five-row limit indiscriminately to all invocation content or add special tool behavior without an explicit contract.
- Replace the legacy `details.diff` interpretation with structured `details.patch`/observed change data. Render creation versus modification only when established, addition/deletion counts, correctly numbered old/new lines, hunk separators, and wrapped continuation gutters. Retain proposed changes with distinct failure diagnostics; do not recolor a proposal as successfully applied before confirmation. Remove the superseded numbered-diff implementation and its fixtures.
- Map roles to existing Pi theme tokens and reuse `highlightCode()`/`getLanguageFromPath()`. Start without custom diff-background tint; retain semantic addition/removal/context styling. Resolve colors on invalidation instead of persisting styled strings.
- Split plain-text normalization from supported styled-output handling. Preserve accepted shell SGR styling while stripping cursor/screen/clipboard control sequences. Ensure truncation cannot emit partial escapes or broken UTF-8. Reuse Pi's ANSI-aware width/wrapping utilities and bound every returned row, including long URLs and one-column viewports.
- Cache projections by the relevant call/group revision, width, expansion, theme invalidation, output availability, and animation phase. Keep source data for reflow; do not retain an unbounded collection of rendered widths or rebuild every historical row on each animation tick.

**Acceptance:** extend pure interpretation/layout tests for real regressions, including a native `details.patch` fixture that fails under the current implementation. Assert semantic colors separately from plain text. Use representative source-backed cases from [integration conformance](codex-tui-tool-cards.md#integration-conformance), excluding explicitly out-of-scope surfaces and Codex terminal-writer quirks. Validate appearance and interaction in the actual Pi TUI rather than relying on large ANSI snapshots.

## 8. Integrated verification and documentation

**Depends on:** all implementation steps.

Run the scoped format, check, and test commands for each affected package:

```sh
for package in pi-tool-display pi-fff-guard pi-utils; do
  vpr "$package#format" --check
  vpr "$package#check"
  vpr "$package#test"
done
```

Use the workspace [testing convention](../../docs/agents/testing.md) and [verification workflow](../../docs/agents/verification.md). Test behavior beside its owning module; retain real host-boundary tests. Establish red/green for regression fixes, including native unified-patch rendering. If implementation changes root tooling or workspace-wide configuration, also run the [workspace-wide checks](../../docs/development.md#focused-validation).

### Terminal and session scenarios

Use disposable directories/sessions with an offline scripted provider issuing real native calls. Exercise both regular and fullscreen TUI modes.

- Adjacent reads/searches/lists, repeated reads, assistant boundaries, overlapping calls, blocked calls, failures, cancellation, and a completed call beside unfinished siblings.
- Global expansion and fullscreen group clicks; scrolling, resizing, link clicks, selection/clipboard behavior, image settings, and image-bearing hidden siblings. Check narrow/wide layouts and dark/light theme changes during and after activity.
- Large/live output, split Unicode/control sequences, authoritative final replacement, retained output expansion, available/missing temporary output, and oversized/unavailable file diffs.
- Two `/reload` cycles, `/new` then `/resume`, restart/resume, fork/tree navigation, compaction rebuild, extension removal, and later-wrapper preservation. Check active tools, ownership, schemas/prompts, and configured native execution after each lifecycle change.
- Create persisted sessions in print, JSON, and RPC modes with no automatic display observation. Reopen each in the TUI: reconstruct cards and eligible groups, expand retained data, use saved edit patches, show missing metadata honestly, and emit no tool execution or replay animation. Confirm new interactive calls can collect metadata afterward.
- Exercise `!` and `!!` success, error, cancellation, expansion, and context exclusion as unchanged Pi behavior; they must not enter exploration groups or the observation path.
- Verify animation stops after completion, cancellation, idle, reload, session replacement, and removal. Verify disposed saved-output work cannot invalidate a new session.

Check PowerShell execution on a host where its backend is available; distinguish that evidence from portable factory/adapter tests. Record any unavailable terminal image protocol or platform checks rather than claiming coverage.

### Documentation changes

- Update package `README.md` for grouped cards, exact settings, defaults, owner-renderer policy, TUI-only observation, and later reconstruction of non-TUI sessions.
- Document observation reads, persisted deleted/context lines, bounded buffers/diffs, temporary-file dependence, private hooks, cleanup, and unavailable-metadata behavior. Publish concrete resource budgets chosen during implementation.
- Update `docs/renderers.md` for the final owner/SDK adapter API and patch contract, removing superseded family signatures and numbered-diff examples. Update all exports and workspace consumers in the same change.
- Update package `AGENTS.md` navigation and `docs/validation.md` for the new modules and interaction/replay checks. Update the FFF guard's navigation after extracting its classifier, plus the new utility package's documentation.
- Link implementation evidence and remaining inherited limits from the decision log. Keep the canonical Codex report unchanged.

**Completion:** all agreed families/integrations work through the same live/replay model; non-TUI sessions reconstruct without metadata capture; native execution and user-shell behavior remain equivalent; lifecycle cleanup and native interactions are verified. Report only the parity and platform behavior actually checked.
