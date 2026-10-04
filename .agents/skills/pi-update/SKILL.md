---
name: pi-update
description: Audit or migrate workspace compatibility with a target Pi release.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Update Pi compatibility

Accept a target version; when none is supplied, use the latest stable release and ask only if it is a pre-release or the request names another release line. Audit and planning requests are read-only; migration requests authorise routine compatible substitutions, subject to the decision boundaries below. Do not commit, stage, reset, or discard changes. Migrated code supports the target only; do not add fallbacks for earlier Pi versions.

## Workflow

Follow the six stages in order; audit and planning requests stop at the handoff without applying changes.

### 1. Establish the baseline

1. Read package instructions and [development guidance](../../../docs/development.md). Inspect staged, unstaged, and untracked work. Treat changes for the same target as an in-progress migration to verify and continue, reported separately in the handoff; preserve all other changes.
2. Record target, declared workspace, and consumer-resolved versions. Run executable, terminal, and API checks against workspace-resolved Pi (`node_modules/.bin/pi` or `resolvePiExecutable`); a global CLI is not target evidence. Global Pi updates require an explicit request.
3. Read every intervening changelog section and linked migration note. Obtain target release or tagged source first if unavailable locally; use `gh` for GitHub.
4. Read relevant [Pi documentation](../../../docs/pi-docs.md) fully and inspect examples, then declarations, exports, and implementation for unsettled contracts. Record source versions. Never edit installed or upstream Pi.
5. Inventory imports, events, provider streams, helpers, private hooks, manifests, settings, tests, launchers, and compatibility claims, following [shared consumers](../../../docs/agents/architecture.md#reuse-decision). Read existing package `docs/pi-compatibility.md` guides, including shared packages. Where no guide exists, inspect the owning code and tests for Pi contracts; report unverified contracts rather than missing documents.
6. Run relevant baseline checks to distinguish existing failures from regressions.

**Complete when:** versions, release evidence, package coverage, shared consumers, and baseline results are recorded, with missing evidence or checks identified.

### 2. Classify release changes

Review in both directions: map release changes to package contracts, and revisit every package's limitations and replacement opportunities against target APIs. Package checklists are minimum coverage; historical evidence is not target-version proof. Apply the [compatibility checks](references/compatibility-checks.md) for each affected area. For replacement candidates, also apply the [Pi API reuse checks](../_aux/audit-reusability/references/pi-apis.md).

For every package, record affected paths and consumers, old and target contracts, versioned evidence, and performed or proposed checks. Classify each result:

- **Required migration:** needed to preserve the supported contract.
- **Optional adoption:** a verified target API can replace local code while preserving policy. Identify the API and removable code.
- **Unaffected:** target-version evidence establishes continued compatibility.
- **Unresolved:** missing evidence prevents a conclusion.

Keep target-specific results in the handoff. Reusable checklist changes belong to an authorised migration when contracts or limitations change.

**Complete when:** every package and relevant release change has a disposition supported by target-version evidence or a named evidence gap.

### 3. Resolve consequential decisions

Pause material policy or significant user-visible choices, such as billable background requests, fallback and authentication, clipboard transports, security-sensitive shell behaviour, and persistent settings migrations. Explain old and new behaviour, affected features, consequences, options, and a recommendation. Continue independent authorised work; routine compatible substitutions need no further approval, and resolved decisions need no repeat approval.

Personal-setting changes and validation with paid providers or real credentials require explicit authorisation. Report consequential cache defaults rather than silently changing them. Prior-release decisions do not authorise changes for another release.

**Complete when:** every consequential choice is resolved or recorded as blocking only the affected work. For audit or planning requests, proceed to handoff with recommendations and unresolved choices, without applying changes.

### 4. Apply the migration

1. Use `vp update` under [dependency conventions](../../../docs/development.md#dependencies). Update the shared Pi [catalog](../../../pnpm-workspace.yaml) and [lockfile](../../../pnpm-lock.yaml); restore root `catalog:` references if the update replaces them with literals.
2. Review release-age restrictions. Keep `minimumReleaseAgeExclude` as Pi-family package names: add Pi-family packages the target introduces and remove names absent from the lockfile. Review transitive scope and verify installed, not merely declared, versions.
3. Capture upgraded-dependency failures before adaptation, including [changed host fingerprints](references/compatibility-checks.md#host-fingerprints). Extend suites for listed invariants under [testing conventions](../../../docs/agents/testing.md#coverage), with red/green regression evidence.
4. Migrate runtime, shared consumers, helpers, providers, and launchers together. Use real offline Pi where stubs miss normalisation or authentication, such as an in-memory model runtime with a scripted provider.
5. Preserve policy outside approved changes, including policies recorded in affected packages' `AGENTS.md` and `docs/pi-compatibility.md`: no model fallback, native-only clipboard, cancellation, and sanitisation.
6. Update documentation and reusable compatibility checklists with target-version evidence. Keep historical external results and limitations version-qualified; local fixtures do not prove live-provider or external-adapter compatibility.

**Complete when:** all authorised migrations, affected consumers, dependency records, tests, and documentation are updated. Record unresolved or blocked work rather than treating it as complete.

### 5. Verify the result

Follow [required verification](../../../docs/agents/verification.md). Start with [focused checks](../../../docs/development.md#focused-validation), fix migration failures, then run the documented workspace-wide checks and tests for the shared upgrade. Run `vp install --offline` when packages are cached; report incomplete caches. `vpr check` fails until every "Last verified" line names the installed Pi version and every [host fingerprint](references/compatibility-checks.md#host-fingerprints) matches it.

Select behavioural checks from the affected [compatibility areas](references/compatibility-checks.md). Distinguish source, automated, terminal, and external evidence; report unavailable checks. Review the final diff, including the lockfile, for correctness and scope, and run `git diff --check`.

**Complete when:** required checks pass, affected contracts and consumers have verification evidence, and unverified terminal, external, or platform behaviour is explicitly identified. Failed required checks leave the migration incomplete.

### 6. Hand off the result

Report target and resolved versions, per-package dispositions, migrations and adoption opportunities, decisions, preserved policies, personal-setting and upstream-default changes, red/green evidence, and [verification results](../../../docs/agents/verification.md). Separate completed work from proposed work and blockers.

**Complete when:** the handoff accounts for every package, consequential decision, and evidence gap, with exact check commands and results.
