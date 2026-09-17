---
name: pi-api-reuse
description: Audit local modules, helpers, types, fixtures, and TUI code for duplication of public APIs exported by installed Pi packages. Use when checking Pi API reuse or planning a reuse-focused refactor.
disable-model-invocation: true
---

# Pi API reuse

Identify local code that can reuse Pi's public APIs to reduce maintenance without losing consumer-specific behavior.

Use `/skill:pi-api-reuse` with optional package or path arguments. Default to a read-only audit of the supplied scope, or the workspace when no narrower scope is given. Apply refactors only when the user requests implementation; an existing implementation request does not need another approval.

## Establish scope and references

1. Read [AGENTS.md](../../../AGENTS.md), applicable package instructions, and the [reuse conventions](../../../docs/agents/architecture.md). Preserve unrelated working-tree changes.
2. Identify the Pi packages actually resolved by affected consumers and record their installed versions. Do not assume the running CLI, workspace dependencies, and online documentation use the same version.
3. Use the [Pi API references](../../../docs/pi-docs.md) to read the relevant installed documentation and examples. Inspect declarations and implementations when documentation does not settle the contract. Do not modify installed Pi packages.
4. Inventory local utilities, shared libraries, extension logic, TUI components, fixtures, validation providers, and handwritten API types. Follow their consumers and existing tests before deciding that code is redundant.

When collaboration tools are available, independent areas can be audited in parallel. Require reviewers to supply exact locations, import paths, behavioral differences, and evidence; reconcile findings against the same installed versions.

## Find candidates

Search for duplicated behavior as well as duplicated names:

- Text-block extraction, formatting, key labels, path discovery, and terminal handling.
- Handwritten types that mirror exported Pi contracts, including inline parameter shapes.
- Message and tool-call constructors, zero-usage objects, provider registration, and stream-event emission.
- Selection, scrolling, wrapping, borders, highlighting, diff rendering, and layout composition.
- Thin wrappers that only rename or reorder an existing API without enforcing useful policy.

Read likely matches instead of repeatedly broadening searches. Distinguish reusable behavior from consumer policy. One expression may be replaceable while the enclosing module remains necessary. Include every consumer of a helper proposed for removal.

## Verify public availability

For each candidate, establish the exact package specifier and exported symbol.

- Check the package entry-point declarations and `package.json` export map. An `export` inside an internal file does not establish a public package API.
- Distinguish public root exports, supported subpath exports, and reachable implementation files. A permissive package without an export map does not make every `dist` file a supported API.
- Use a minimal runtime import probe when value-export availability is uncertain. Type-only exports require declaration inspection or type checking, not a runtime namespace lookup.
- Check the installed implementation for relevant defaults and side effects. An import that succeeds proves availability, not behavioral equivalence.
- Do not bypass an export map or introduce an internal deep import merely to eliminate a small helper. If the needed API is not public, classify the replacement as unavailable for this audit.

## Compare behavior

Check only the dimensions relevant to the candidate, but make the comparison explicit:

- **Inputs and outputs:** accepted content forms, separators, empty values, trimming, sanitization, ordering, truncation, and return types.
- **Identity and mutation:** caller-supplied IDs, model identity, timestamps, borrowed arguments, cloning, and fresh versus shared nested objects. Compare constructors and streaming paths separately.
- **Lifecycle:** start/delta/end ordering, partial versus final results, repeat requests, context-derived scenarios, cancellation, error classification, disposal, and restoration.
- **Dependencies and side effects:** injected versus global theme/keybindings, environment overrides, filesystem access, clipboard transports, process execution, credentials, and network behavior.
- **Resource limits:** bounded input, retained output, head-and-tail policies, UTF-8/grapheme safety, cooperative yielding, and cancellation during expensive work.
- **TUI integration:** standalone rendering versus layout-engine participation, viewport clipping, controlled selection/scrolling, async preparation, mouse coordinates, image ownership, and invalidation.
- **Types:** whether the local shape represents the same upstream contract or deliberately narrows it. Prefer the exported type, or an intentional derivation, over a separately maintained mirror.

Use small offline probes when source inspection leaves a material uncertainty. Exercise the relevant failure or cancellation path, not just success. Use disposable state for checks that write data and do not inherit real credentials. Do not build a new harness or repeat upstream test suites for a straightforward substitution.

## Classify and recommend

Assign each investigated candidate one classification:

- **Direct substitution:** a verified public API preserves the required contract and removes duplication without compensating complexity.
- **Conditional refactor:** a public API exists, but adoption changes behavior, policy, integration, or dependencies. Name the exact condition or decision required.
- **Keep local:** the code already composes Pi appropriately, adds required behavior, or has no suitable public replacement.
- **Unresolved:** evidence is insufficient. Name the missing check; do not present the replacement as established.

Prioritize direct substitutions. Recommend a conditional refactor only when its concrete benefit justifies the migration and remaining adaptation. A larger module is not automatically a larger opportunity. Do not invent findings to satisfy a count.

Report:

1. Installed Pi versions and audited scope.
2. Each actionable finding's `path:line`, local symbol, replacement symbol and import path, classification, confidence, and expected benefit.
3. Behavioral differences, affected consumers, and significant reasons to retain apparent duplicates.
4. Checks actually performed and unresolved limitations. Separate verified results from proposed verification.
5. A focused recommendation for what to refactor now and what to defer.

## Lessons from the Pi 0.85.1 audit

These are examples to reverify against the installed version, not a permanent allowlist or blacklist.

- `contentText()` from `@earendil-works/pi-ai` replaced string-or-block extraction and text-block filter/map/join sequences. Preserve surrounding trimming and sanitization, and verify the separator.
- `fauxToolCall(name, args, { id })` replaced an equivalent fixture helper. Updating consumers directly retained explicit IDs and removed the helper without an alias.
- `ToolRenderResultOptions` from `@earendil-works/pi-coding-agent` replaced an inline `{ expanded: boolean; isPartial: boolean }` contract. API reuse includes types, not just runtime functions.
- `fauxAssistantMessage()` shared its usage object. Normal faux streaming rewrote model identity and produced independent usage, while a factory-thrown abort became an `error`; the factory-error path used shared defaults. Constructor behavior alone did not establish stream behavior or cancellation parity.
- `getPackageDir()` honored `PI_PACKAGE_DIR`, unlike explicit installed-dependency discovery. A simpler implementation would have changed the isolated launcher's contract.
- `formatKeyText()` and `keyDisplayText()` were not public coding-agent exports. `getGraphemeSegmenter()` was not a TUI root export. Public key-hint helpers also introduced global theme/keybinding dependencies and different presentation.
- `ScrollView.render()` did not itself crop to the viewport; clipping relied on layout integration. It was not a direct replacement for a controlled, asynchronously prepared preview.
- Windowed selection already delegated to `SelectList`. Bounded output/diffs, cooperative text layout, native-only clipboard behavior, terminal sanitization, and responsive UI lifecycle handling added contracts that similarly named Pi APIs did not preserve.

## Implement requested refactors

When implementation is requested, apply the established in-scope substitutions. Remove superseded helpers and type mirrors, update all affected consumers, and preserve explicit IDs, data ownership, and surrounding policy. Do not retain compatibility aliases unless requested or silently include conditional redesigns.

Update documentation when guidance becomes inaccurate. Follow the [verification workflow](../../../docs/agents/verification.md) and [testing conventions](../../../docs/agents/testing.md).
