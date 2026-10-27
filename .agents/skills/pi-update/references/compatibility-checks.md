# Pi compatibility checks

[Return to the Pi update workflow](../SKILL.md).

Apply each area affected by the target release or a package's compatibility checklist. Pair old and target contracts with versioned evidence, then select checks that can establish the changed behaviour. Record gaps where required evidence is unavailable.

## Messages and tools

Review application versus provider contexts, normalisation, system and usage messages, discovery, JSON-compatible arguments and details, and borrowed data. Build fixtures against provider contracts; the first message need not be a user message.

## Requests

Check registry streaming, normalisation, resolved options, authentication, headers, URLs, environment overrides, reasoning, model and sampling policy, cancellation, timeouts, complete and incomplete responses, and safe errors, including authentication failures. Prefer verified public APIs while preserving model policy. Use the workflow's authorisation boundary for paid-provider or real-credential checks.

## Lifecycle and private TUI

- Check hooks and return types, fail-closed `user_bash`, prompt-mutating `before_agent_start`, reload, cleanup, interruption, and reconstruction. Confirm changed events are used before migrating their consumers.
- Review private TUI construction, layout, notice insertion, native rows, and patch ownership and restoration. Check both API and executable contracts where used; passing API tests do not prove executable private hooks.
- Verify contracts before changing fingerprints; retain valid fingerprints. See [host fingerprints](#host-fingerprints).

## Host fingerprints

Six owner files record reviewed SHA-256 hashes of private Pi method source. Each owner lists two hashes per method: one for the unbundled API build (`dist/`), and one for the minified installed CLI (`dist/bundle/cli.js`).

Gate private methods where the native implementation can be checked without rejecting supported wrapper composition. Include called-only private dependencies: smart compaction checks immediate message appends, editor widgets check UI-context construction, and tool display checks startup expansion and status-row reuse. Public component and session methods retain their declared contracts and do not need a fingerprint merely because an extension calls them.

Tool display's host integration hooks and editor widgets' host and renderer hooks use `unwrapHook` from [shared owned hooks](../../../../packages/libs/src/owned-hooks/README.md) before checking compatibility. Its weak, process-global `Symbol.for` registry follows recorded predecessors across module reloads and after restoration. Each of these two owners exports `inspectedPiVersion = "1.4.0"` and compares it with Pi's public `VERSION`.

The deepest value returned by `unwrapHook` must be callable. A reviewed source hash accepts that value on any version. An unknown hash is accepted only when public `VERSION` equals the owner's pin. Otherwise, the affected feature stays disabled and reports its existing warning.

An unrecorded callable can be an unknown wrapper or a changed native method. On the verified version, both are accepted; version evidence cannot distinguish them. On an unverified version, an unknown wrapper disables the gated feature until the contracts and version pin are reviewed.

Tool-display row and assistant source checks stay strict. Mode hooks also require reviewed source hashes; the version pin gives no allowance. Their failure disables only mode cycling.

| Owner                                                                                                         | Hooked Pi source                                                                     | Methods                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [`native-tools/compatibility.ts`](../../../../packages/libs/src/native-tools/compatibility.ts)                | `AgentSession` (`core/agent-session.js`)                                             | `_buildRuntime`, `_refreshToolRegistry`                                                                                   |
| [`pi-smart-compact/src/compatibility.ts`](../../../../packages/extensions/pi-smart-compact/src/compatibility.ts) | `AgentSession`, `compact` (`core/compaction/compaction.js`)                          | `_compactBeforeNextAssistantResponse`, `_runAutoCompaction`, `_runDefaultCompaction`, `_appendCustomMessage`, `compact`, `AgentSession.compact` |
| [`pi-editor-widgets/src/host.ts`](../../../../packages/extensions/pi-editor-widgets/src/host.ts) | `InteractiveMode`, `TuiMainScreen`, `TuiAltScreen` | `setExtensionStatus`, `renderWidgets`, `setExtensionFooter`, `createExtensionUIContext`, `switchTuiMode`, both renderers' `doRender` |
| [`pi-tool-display/src/host/compatibility.ts`](../../../../packages/extensions/pi-tool-display/src/host/compatibility.ts) | `InteractiveMode` (`modes/interactive/interactive-mode.js`), `ToolExecutionComponent` | `getRegisteredToolDefinition`, `renderSessionItems`, `handleEvent`, `addMessageToChat`, `addCustomEntryToChat`, `maybeShowThinkingDropNotice`, `addCacheMissNotice`, `addCacheWarmingUsage`, `showExtensionNotify`, `switchTuiMode`, `updateThinkingBlockVisibility`, `getStartupExpansionState`, `showStatus`, `toggleToolOutputExpansion`, `setToolsExpanded`, `render`, `handleMouse` |
| [`pi-tool-display/src/host/assistant.ts`](../../../../packages/extensions/pi-tool-display/src/host/assistant.ts) | `AssistantMessageComponent` (`modes/interactive/components/assistant-message.js`) | `updateContent` |
| [`pi-skills/src/editor.ts`](../../../../packages/extensions/pi-skills/src/editor.ts) | `Editor` (`@earendil-works/pi-tui`, `components/editor.js`) | `tryTriggerAutocomplete`, `requestAutocomplete` (called, not replaced) |

Run `vpr fingerprints:check` from the workspace root; `vpr check` and CI also run it. It hashes both builds of the installed Pi and marks each hash that its owner file does not list (`CHANGED`). It also marks each quoted 64-hex string in non-test TypeScript under `packages/` that the methods registered for that file do not produce (`UNCLAIMED`), and each `owners` path that no longer exists (`MISSING`); an unavailable imported pin owner fails module loading before that report. It also fails if either tool-display or editor-widgets `inspectedPiVersion` differs from the public `VERSION` reported by either installed build. It does not read the table above.

The CLI probe runs `--help` with only the fingerprint extension enabled. It uses a temporary home and working directory, excludes inherited provider credentials, and sends no model prompt. The [unit test](testing.md#must-not-regress) checks the argument and environment builder without starting Pi.

Hash `Function.prototype.toString.call(method)` so a method's own `toString` override cannot hide a changed implementation. A failed compatibility gate must disable only the affected feature without breaking Pi startup or leaving partial hooks for that feature installed. Check replacement instances before attaching their private hooks too.

When you add, rename, or remove a fingerprinted hook, update `owners` in the script and the table above in the same change. A changed hash means the method body changed: diff the old and new source of that method, verify the hook still holds, and only then replace the hash. Review the affected contracts before changing a version pin. `pi-smart-compact` also pins `VERSION`.

## Private hook replacement

Check every private hook for a public replacement in the target release, including hooks whose fingerprints did not change. Private hooks include the [fingerprinted methods](#host-fingerprints) and every other prototype or instance property replacement; search the workspace for `OwnedHooks` and direct property assignments.

1. List each hook with the package features that depend on it, from the owner code and the package's `docs/pi-compatibility.md`.
2. Search the target's documentation, examples, declarations, and implementation for public APIs that give the same behaviour, such as events, renderer registration, `ctx.ui` methods, tool definition fields, and exported components.
3. Classify each hook with versioned evidence:

   | Parity  | Disposition                                                                                                |
   | ------- | ---------------------------------------------------------------------------------------------------------- |
   | Full    | Optional adoption. Name the public API and the hook code it removes.                                       |
   | Partial | Keep the hook. Record each feature that the public API cannot keep, and the public API that Pi would need. |
   | None    | Keep the hook. Record the public API that Pi would need.                                                   |

4. Count a replacement as full parity only when it keeps the package policies in its `AGENTS.md` and compatibility checklist. For example, a tool override is not a replacement when the package forbids registering tools.
5. Do not remove a feature to remove a hook unless the user approves it in the decision stage.
6. Report every result in the handoff. In an authorised migration, update the package's replacement opportunities in `docs/pi-compatibility.md`.

## Visible history

Metadata is not insertion. Invisible system or usage entries cannot split groups; visible notices must. Verify live insertion and no-op boundaries, ownership and restoration, and replay against the workspace-resolved Pi executable as well as API-level checks.

## Defaults and side effects

Review background and cache requests, billing and usage, credentials, writes, clipboard, shell execution, persistence, and network behaviour. Unchanged settings do not imply unchanged defaults. Resolve consequential changes through the workflow's decision stage.

## Documentation and fixtures

Review version claims, mirrored types, fake providers, process harnesses, and external adapters. Type-correct fakes can hide integration mismatches; identify where real offline Pi is needed and where external checks remain necessary.

## Terminal behaviour

Use [offline display scenarios](../../../../packages/extensions/pi-tool-display/docs/validation.md) with isolated settings, files, and history. Check applicable regular/fullscreen modes, thinking, expansion, themes and widths, repeated reload, and replay without reexecution. Retain fixtures through replay and exit all fixture sessions before removing them.

## External and platform behaviour

Check real FFF/MCP integrations, images, clipboard, and Windows/PowerShell behaviour when relevant and available. Identify unavailable integrations or platforms for the handoff.
