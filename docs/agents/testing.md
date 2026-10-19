# Testing

[Workspace development](../development.md)

Every test is a maintenance cost. Write the minimum: each automated test protects one listed invariant whose regression has high or critical severity. Behaviour outside the list gets no automated test, however easy it is to test.

## Coverage

Each package's `docs/testing.md` lists its invariants under "Must not regress". That list is the complete scope of the package's unit, integration, and e2e tests.
Root fingerprint tooling uses the [Pi-update invariant list](../../.agents/skills/pi-update/references/testing.md#must-not-regress), and the release build uses the [release branch list](../development.md#release-branch).

When you change code:

1. Read the affected package's `docs/testing.md` and the tests for the invariants your change touches.
2. For a listed invariant, run its tests. For a regression fix, show the failure (red) with an existing test before the fix and the pass (green) after it. Add a case only when no retained test exposes the defect.
3. If the change creates a [high or critical](#severity) risk that no listed invariant covers, stop and propose the invariant to the user, with its severity and the plausible defect. Add the invariant and its test only after explicit approval.
4. When behaviour is removed or drops below the bar, remove its invariant and tests in the same change.

A bug fix alone does not warrant a new test. If the fixed behaviour is not listed, fix it without a test, or propose an invariant under step 3.

### Severity

Critical severity covers loss or corruption of user or session data; credentials or secrets sent or shown to the wrong destination; bypass of a trust or security boundary, such as untrusted project settings, path escape, symlinks, or file ownership; an irreversible or destructive action.

High severity covers a silent wrong result that the user or model is unlikely to notice, such as wrong model context, lost input, or wrong saved facts; ignored cancellation or abort; a broken Pi startup or session; state or resources leaking across sessions.

Layout, wording, colours, glyphs, UI ordering, cosmetic limits, and convenience behaviour are below the bar. Verify them with manual checks.

### Layers

| Layer       | Boundary and observations                                                                                                                                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| e2e         | Drives a real Pi host (SDK session or installed CLI) with an offline faux provider, through public inputs such as prompts, tool calls, commands, and reload. Asserts what the user or model observes: provider requests, saved sessions, tool results, rendered output. |
| integration | Uses a real filesystem, lock, or subprocess, without a Pi host.                                                                                                                                                                                                         |
| unit        | Tests one module, in process.                                                                                                                                                                                                                                           |

Choose the layer in this order:

1. Use e2e when the invariant spans more than one lifecycle step or crosses a Pi boundary: events, tool execution, session save or reload, provider requests, or settings with trust. This is the default for feature behaviour.
2. Use integration when the risk sits at a filesystem or process boundary and needs no host.
3. Use unit only for pure security or data-integrity functions whose edge cases e2e cannot reach cheaply, such as path containment, patch parsing, or private-file checks.

### Budget

- Write one test per invariant. Use a parameterised table only when each row is a distinct failure mode of that invariant.
- Before adding a case, name the defect that retained tests cannot catch. If you cannot name one, the case is redundant.
- Prefer one e2e scenario that exercises several listed invariants of a feature over a unit test for each.

## Test quality

- Tautological tests cannot reveal incorrect behaviour. Use independently specified results or invariants, rather than expectations derived from the result or a duplicate of the implementation's algorithm.
- Change-detector tests fail during equivalent internal refactors. Assert observable contracts rather than implementation details.
- A passing reduced suite does not prove that removed coverage was redundant. Preserve distinct regression scenarios of listed invariants during cleanup.

## Ownership

Test each invariant once, at the layer that owns it. Consumers test local policy and the integration risks of their adapters, wrappers, or monkey-patches, not unchanged Pi behaviour or shared-library algorithms.

| Layer                                                                     | Owns invariants for                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Utils](../../packages/utils/docs/testing.md)                             | Pure validation and parsing: paths, patches, model references, search scopes, and FFF provenance.                 |
| [Libs](../../packages/libs/docs/testing.md)                               | Reusable protocols with I/O or scheduling: files, locks, settings, cancellation, terminal safety, and shared TUI. |
| Extensions                                                                | Feature policy: schemas, activation, persistence, and the wiring of shared helpers.                               |
| [Tool display](../../packages/extensions/pi-tool-display/docs/testing.md) | Rendering of other extensions' tool cards through its adapters.                                                   |

A consumer lists an invariant for a shared helper only where it could omit a safety option or misread a shared result. It does not repeat the shared failure matrix.

## Package testing guide

Each package's `docs/testing.md` uses this shape and adds no other sections:

```md
# <Package> test coverage for maintainers

[Package](../README.md) · [Testing policy](<path>/docs/agents/testing.md#coverage)

<One or two sentences: what this package tests, and what libs, utils, Pi, or other packages own. If invariants carry IDs such as (J1), one more sentence says what the IDs refer to.>

## Must not regress

### <Optional group>

- **Critical, e2e:** <observable invariant>
- **High, unit:** <observable invariant>

## Not tested

- <Behaviour a reader could expect to be tested> is below the severity bar.
- <Owner> owns <behaviour a reader could expect to be tested>.

## Manual checks

<Optional: setup line with a launch command, followed by a Do / Expect table. Put a long table in `docs/validation.md`, and link it here.>
```

State each invariant as an observable outcome, not as a test name or an implementation detail. List Critical invariants before High ones, within each group when the list has groups. Group invariants under H3 headings or not at all, never under plain-text labels.

Write each "Not tested" bullet as a full sentence that names the owner or the reason. Packages with no invariants say so under "Must not regress", and use `vp test run --passWithNoTests`. Omit a "Not tested" bullet that only repeats that there are no invariants, and omit the section when no bullet remains.

## Filesystem fixtures

Create mutable filesystem fixtures with `mkdtemp` or `mkdtempSync` under `tmpdir()` from `node:os`, not workspace `.tmp/`. Remove them during teardown. Workspace fixtures can become Vite+ cache inputs and cause misses.

## Runner

Colocate unit and integration `*.test.ts` files with their behaviour. Extensions can keep e2e tests and their host fixtures in `validation/`. Import explicitly from `vite-plus/test` and use `vp test run` with missing-test failures visible.

The root `vite.config.ts` sets one hang guard for each test, so do not give a test its own limit. Vitest does not search parent directories for it, so each package `test` script passes it with `--config`. The full suite runs many processes at once, and a test can take several times as long as it does alone. Guard process runs and fixture waits with [`STEP_TIMEOUT_MS`](../../packages/libs/src/validation/pi-process/README.md). Assert a time limit only when the limit is the behaviour under test.

Use the whole package suite when the change spans its behaviour. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
