---
name: pi-update
description: Audit or migrate Pi compatibility using target changelogs, installed contracts, tests, and offline terminal checks. Use for Pi dependency updates and release adaptation.
disable-model-invocation: true
---

# Update Pi compatibility

Accept a target version; audit/plan requests remain read-only.

## Establish the baseline

1. Read package instructions and [development guidance](../../../docs/development.md); inspect staged/unstaged work.
2. Record target, running CLI, declared workspace, and consumer-resolved versions; they may differ. Ask only for material target ambiguity. Do not update global Pi unless requested.
3. Read every intervening changelog section and linked migration note. Obtain target release/tagged source first if unavailable locally; use `gh` for GitHub.
4. Read relevant [Pi docs](../../../docs/pi-docs.md) fully and inspect examples, then declarations/exports/implementation for unsettled contracts. Record source versions; never edit installed/upstream Pi.
5. Inventory imports, events, provider streams, helpers, private hooks, manifests, settings, tests, launchers, and compatibility claims, following [shared consumers](../../../docs/agents/architecture.md#reuse-decision). Read every package's `docs/pi-compatibility.md`, including shared packages; report missing checklists.
6. Run relevant baseline checks to distinguish existing failures from regressions.

## Audit the release changes

Review in both directions: map release changes to package contracts, and revisit each package's limitations/replacement opportunities against target APIs. Checklists are minimum coverage; linked historical evidence is not target-version proof.

For every package, record affected paths/consumers, old/target contracts, versioned evidence, and checks. Classify required migration, optional adoption, unaffected, or unresolved. For adoption, identify the verified replacement API, removable code, and preserved policy. Keep target-specific results in the handoff; update reusable checklists when contracts or limitations change.

Review affected areas:

- **Messages/tools:** application/provider contexts, normalization, system/usage messages, discovery, JSON-compatible arguments/details, borrowed data. Fixtures use provider contracts; first messages need not be user messages.
- **Requests:** registry streaming, authentication, headers, URLs, environment overrides, reasoning, sampling, cancellation, timeout, incomplete responses, safe errors. Prefer verified public APIs; preserve model policy.
- **Lifecycle:** hooks/return types, fail-closed `user_bash`, prompt-mutating `before_agent_start`, reload, cleanup, interruption, reconstruction. Verify changed events are used before migrating.
- **Private TUI:** construction, layout, notice insertion, native rows, patch ownership/restoration. Check API and executable where used. Verify contracts before changing fingerprints; retain valid ones.
- **Visible history:** metadata is not insertion. Invisible system/usage entries cannot split groups; visible notices must. Check live, no-op, and replay boundaries.
- **Defaults/effects:** background/cache requests, billing/usage, credentials, writes, clipboard, shell, persistence, network. Unchanged settings do not imply unchanged defaults.
- **Docs/fixtures:** version claims, mirrored types, fake providers, process harnesses, external adapters. Type-correct fakes can hide integration mismatches.

Use [reuse auditing](../audit-reusability/SKILL.md) and [Pi API checks](../audit-reusability/references/pi-apis.md).

## Resolve consequential decisions

Pause material policy or significant user-visible choices; explain old/new behavior, affected features, consequences, options, and recommendation. Continue independent authorized work.

Examples: billable background requests, fallback/authentication, clipboard transports, security-sensitive shell behavior, and persistent settings migrations. Routine compatible substitutions need no approval; do not re-ask resolved decisions.

Leave personal settings untouched without authorization. Report consequential cache defaults rather than silently changing them. Prior-release decisions do not authorize another release. Paid providers/real credentials require explicit validation authorization.

## Apply the migration

1. Use `vp update` under [dependency conventions](../../../docs/development.md#dependencies). Keep shared Pi versions in the [catalog](../../../pnpm-workspace.yaml), include the [lockfile](../../../pnpm-lock.yaml), and restore root `catalog:` references if replaced by literals.
2. Review release-age restrictions; limit necessary exceptions to exact Pi-family versions and remove superseded exceptions. Review transitive scope and verify installed, not merely declared, versions.
3. Capture upgraded-dependency failures before adaptation. Extend suites under [testing conventions](../../../docs/agents/testing.md) with red/green regression evidence.
4. Migrate runtime, shared consumers, helpers, providers, and launchers together. Use real offline Pi where stubs miss normalization/authentication, e.g. an in-memory model runtime/scripted provider.
5. Preserve unmodified policy: configured-model validation, no fallback, cancellation, sanitization, native-only clipboard, ownership, and grouping.
6. Correct docs with target-version evidence. Keep historical external results/limitations version-qualified; local fixtures do not prove live-provider/external-adapter compatibility.

## Verify the result

Follow [verification](../../../docs/agents/verification.md): start with [focused checks](../../../docs/development.md#focused-validation), fix migration failures, then check the shared upgrade workspace-wide:

```sh
vpr check
vp test run
```

Run `vp install --offline` when packages are cached; report incomplete caches.

Choose checks from changed contracts:

- **Requests:** normalization, resolved options, cancellation/timeouts, complete/incomplete responses, safe auth failures, model/sampling policy.
- **Host:** insertion/no-op boundaries, replay, ownership/restoration, installed CLI. Passing API tests do not prove executable private hooks.
- **Terminal:** use [offline display scenarios](../../../packages/extensions/pi-tool-display/docs/validation.md) with isolated settings/files/history. Check applicable regular/fullscreen, thinking, expansion, themes/widths, repeated reload, and replay without reexecution. Keep fixtures through replay; exit before removal.
- **External/platform:** real FFF/MCP, images, clipboard, Windows/PowerShell when relevant and available. Distinguish source, automated, terminal, and external evidence; report unavailable checks.

Review the lockfile in the final diff and run `git diff --check`.

## Handoff

Report target/resolved versions, per-package dispositions, migrations/adoption opportunities, decisions, preserved policies, personal-setting/upstream-default changes, red/green evidence, and [verification results](../../../docs/agents/verification.md).
