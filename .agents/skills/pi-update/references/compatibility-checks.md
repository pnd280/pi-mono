# Pi compatibility checks

[Return to the Pi update workflow](../SKILL.md).

Apply each area affected by the target release or a package's compatibility checklist. Pair old and target contracts with versioned evidence, then select checks that can establish the changed behavior. Record gaps where required evidence is unavailable.

## Messages and tools

Review application versus provider contexts, normalization, system and usage messages, discovery, JSON-compatible arguments and details, and borrowed data. Build fixtures against provider contracts; the first message need not be a user message.

## Requests

Check registry streaming, normalization, resolved options, authentication, headers, URLs, environment overrides, reasoning, model/sampling policy, cancellation, timeouts, complete and incomplete responses, and safe errors, including authentication failures. Prefer verified public APIs while preserving model policy. Use the workflow's authorization boundary for paid-provider or real-credential checks.

## Lifecycle and private TUI

- Check hooks and return types, fail-closed `user_bash`, prompt-mutating `before_agent_start`, reload, cleanup, interruption, and reconstruction. Confirm changed events are used before migrating their consumers.
- Review private TUI construction, layout, notice insertion, native rows, and patch ownership/restoration. Check both API and executable contracts where used; passing API tests do not prove executable private hooks.
- Verify contracts before changing fingerprints; retain valid fingerprints.

## Visible history

Metadata is not insertion. Invisible system or usage entries cannot split groups; visible notices must. Verify live insertion and no-op boundaries, ownership/restoration, and replay against the installed CLI as well as API-level checks.

## Defaults and side effects

Review background and cache requests, billing/usage, credentials, writes, clipboard, shell execution, persistence, and network behavior. Unchanged settings do not imply unchanged defaults. Resolve consequential changes through the workflow's decision stage.

## Documentation and fixtures

Review version claims, mirrored types, fake providers, process harnesses, and external adapters. Type-correct fakes can hide integration mismatches; identify where real offline Pi is needed and where external checks remain necessary.

## Terminal behavior

Use [offline display scenarios](../../../../packages/extensions/pi-tool-display/docs/validation.md) with isolated settings, files, and history. Check applicable regular/fullscreen modes, thinking, expansion, themes and widths, repeated reload, and replay without reexecution. Retain fixtures through replay and exit all fixture sessions before removing them.

## External and platform behavior

Check real FFF/MCP integrations, images, clipboard, and Windows/PowerShell behavior when relevant and available. Identify unavailable integrations or platforms for the handoff.
