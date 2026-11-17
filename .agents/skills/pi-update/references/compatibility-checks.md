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

## Host fingerprints

Owner files record reviewed SHA-256 hashes of private Pi method source. Each owner lists two hashes per method: one for the unbundled API build (`dist/`), and one for the minified installed CLI that `dist/bundle/cli.js` starts, whose code is in `dist/bundle/chunks/`.

Gate private methods where the native implementation can be checked without rejecting supported wrapper composition. Include called-only private dependencies: smart compaction checks immediate message appends, and tool display checks startup expansion and status-row reuse. Public component and session methods retain their declared contracts and do not need a fingerprint merely because an extension calls them.

Tool display's host integration hooks and editor widgets' host and renderer hooks check compatibility with `hookCompatible` from [hook provenance](../../../../packages/libs/src/owned-hooks/provenance.md#host-fingerprints), against the `inspectedPiVersion` that each of these two owners exports. When the check fails, the affected feature stays disabled and reports its existing warning until the contracts and version pin are reviewed.

Tool-display row and assistant source checks stay strict. Mode hooks also require reviewed source hashes; the version pin gives no allowance. Their failure disables only mode cycling.

| Owner                                                                                                                                              | Hooked Pi source                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`pi-tool-display/src/host/native-tools/compatibility.ts`](../../../../packages/extensions/pi-tool-display/src/host/native-tools/compatibility.ts) | `AgentSession` (`core/agent-session.js`)                                              |
| [`pi-smart-compact/src/compatibility.ts`](../../../../packages/extensions/pi-smart-compact/src/compatibility.ts)                                   | `AgentSession`, `compact` (`core/compaction/compaction.js`)                           |
| [`pi-editor-widgets/src/host.ts`](../../../../packages/extensions/pi-editor-widgets/src/host.ts)                                                   | `InteractiveMode`, `TuiMainScreen`, `TuiAltScreen`                                    |
| [`pi-tool-display/src/host/compatibility.ts`](../../../../packages/extensions/pi-tool-display/src/host/compatibility.ts)                           | `InteractiveMode` (`modes/interactive/interactive-mode.js`), `ToolExecutionComponent` |
| [`pi-tool-display/src/host/assistant.ts`](../../../../packages/extensions/pi-tool-display/src/host/assistant.ts)                                   | `AssistantMessageComponent` (`modes/interactive/components/assistant-message.js`)     |
| [`pi-skills/src/editor.ts`](../../../../packages/extensions/pi-skills/src/editor.ts)                                                               | `Editor` (`@earendil-works/pi-tui`, `components/editor.js`)                           |
| [`libs/src/tui/responsive-custom-ui/fullscreen-input.ts`](../../../../packages/libs/src/tui/responsive-custom-ui/fullscreen-input.ts)               | `TuiBase` (`@earendil-works/pi-tui`, `tui.js`)                                        |

Run `vpr fingerprints:check` from the workspace root; `vpr check` and CI also run it. It hashes the methods in both builds of the installed Pi and checks them, and the version pins, against the owner files.

A failed compatibility gate must disable only the affected feature without breaking Pi startup or leaving partial hooks for that feature installed. Check replacement instances before attaching their private hooks too.

When you add, rename, or remove a fingerprinted hook, update `owners` in the script, and the table above, which the check does not read, when an owner file or hooked Pi source changes. A changed hash means the method body changed: diff the old and new source of that method, verify the hook still holds, and only then replace the hash.

To get both sources, [fetch the previous release](#fetch-a-release), then diff the hooked file from the table above, such as `diff -u .tmp/pi-releases/<previous>/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`. A changed CLI hash with no API source change comes from bundling; diff that method in both releases' `dist/bundle/chunks/`. Chunk file names can differ between releases, so find the chunk in each release from the workspace root with `rg -l <method> node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks` and `rg -l <method> .tmp/pi-releases/<previous>/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks`. Review the affected contracts before changing a version pin. `pi-smart-compact` also pins `VERSION`.

## Fetch a release

This installs `pi-coding-agent` of one release with all its dependencies, without install scripts. The Pi family lands in `.tmp/pi-releases/<version>/node_modules/@earendil-works/<package>/`.

```sh
npm install --prefix .tmp/pi-releases/<version> --ignore-scripts --no-audit --no-fund --no-package-lock @earendil-works/pi-coding-agent@<version>
```

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

Check real MCP integrations, images, clipboard, and Windows/PowerShell behaviour when relevant and available. Identify unavailable integrations or platforms for the handoff.
