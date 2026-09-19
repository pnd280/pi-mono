---
name: audit-inconsistencies
description: Audit user-facing surfaces for inconsistencies in wording, layout, color semantics, visual hierarchy, controls, state, and feedback. Use when reviewing consistency across extensions, commands, widgets, browsers, tool cards, notifications, or settings.
---

# User interface consistency audit

Identify differences that make the same concept look, read, or behave differently across user-facing surfaces. Distinguish misleading behavior from cosmetic variation and intentional differences between contexts.

Use `/skill:audit-inconsistencies` with optional paths or a focus such as color, hierarchy, or wording. Default to the [workspace extensions](../../../packages/extensions/). Inspect shared components and host integration as needed to explain the selected surfaces. Apply fixes only when the user requests implementation. An existing implementation request does not need another approval.

## Establish scope

1. Read [workspace instructions](../../../AGENTS.md), applicable package instructions, and relevant presentation and interaction documentation. Inspect the current working tree, including staged changes, and preserve unrelated work.
2. Inventory the relevant user journeys and surfaces: commands and completions, browsers, details and previews, widgets, working messages, tool cards, notifications, settings, and recovery messages. Record each surface's owner, entry point, supported modes, states, and comparable surfaces.
3. Trace rendering, text, theme, input, and state ownership through shared-library consumers. Establish the comparison baseline from documented contracts and existing conventions. For Pi-dependent behavior, check the installed version and relevant [Pi references](../../../docs/pi-docs.md). The running CLI and workspace dependencies may differ.
4. State material exclusions. Compare the same concept under equivalent conditions. Different roles or space constraints can require different presentations.

## Load relevant categories

Read the category references needed for the requested focus and surfaces. For a broad audit, load relevant references as you reach each category. Follow overlapping categories when needed to investigate a suspected inconsistency.

| Category                                                                     | Load when comparing                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Terminology and copy](references/terminology-and-copy.md)                   | Names, verbs, status wording, labels, and documentation.                   |
| [Layout](references/layout.md)                                               | Framing, spacing, wrapping, nesting, density, and overflow.                |
| [Controls](references/controls.md)                                           | Hints, bindings, input precedence, paging, focus, and cancellation.        |
| [State and counts](references/state-and-counts.md)                           | Totals, filters, progress, dependencies, and deleted items.                |
| [Loading and recovery](references/loading-and-recovery.md)                   | Loading, empty, unavailable, restricted-access, and retry states.          |
| [Destructive actions](references/destructive-actions.md)                     | Confirmation, cancellation, irreversible effects, and partial success.     |
| [Feedback](references/feedback.md)                                           | Notification severity, attribution, placement, timing, and next steps.     |
| [Configuration](references/configuration.md)                                 | Effective values, scopes, overrides, fallbacks, and reload requirements.   |
| [Continuity and freshness](references/continuity-and-freshness.md)           | Navigation state, unsaved changes, live data, snapshots, and restoration.  |
| [Text and accessibility](references/text-and-accessibility.md)               | Unicode, sanitization, exact source, contrast, and non-color cues.         |
| [Color semantics](references/color-semantics.md)                             | Theme tokens, semantic roles, selection, and severity styling.             |
| [Semantic and visual hierarchy](references/semantic-and-visual-hierarchy.md) | Reading order, emphasis, grouping, relationships, and constrained layouts. |

When collaboration tools are available, independent areas can be audited in parallel. Use the same baseline and require concrete comparisons, source locations, and reproduction conditions before combining findings.

## Verify differences

1. Inspect source, consumers, existing tests, and documentation for each candidate. Capture exact strings, tokens, layout rules, or behavior on both sides of the comparison.
2. Use small offline render or interaction probes when static inspection leaves a material uncertainty. Prefer existing fixtures and include the relevant transition or failure path. Choose states, modes, viewport sizes, themes, content, and bindings based on the candidate rather than requiring every combination.
3. Compare equivalent data side by side. Record reproduction conditions and distinguish source evidence, headless rendering, and actual host behavior.
4. Use real-terminal checks for host paging, focus, clipping, theme appearance, and other concerns that headless rendering cannot establish. If unavailable, state the limitation instead of treating source inspection as visual confirmation.

Keep probes non-destructive and use disposable state for operations with side effects. Do not load private prompt collections, replace the real clipboard, use real credentials, or make paid requests merely to produce audit examples. Do not build a new harness or run broad suites when focused evidence settles the question.

## Classify and report

- **Defect:** a surface misstates state or effects, violates its contract, or makes an action unusable or misleading.
- **Consistency improvement:** comparable concepts differ without a clear user benefit; standardization would improve comprehension or predictability.
- **Intentional variation:** a difference follows from distinct roles, constraints, or documented behavior. Record significant examples rather than recommending uniformity.
- **Unresolved:** evidence is insufficient. Name the missing check and avoid presenting the candidate as confirmed.

Separate classification from confidence. A source-confirmed implementation difference can still require terminal validation to establish its visual impact. Prioritize differences that misrepresent state or effects, hide recovery, or advertise unusable controls before purely cosmetic variation.

For each actionable finding, provide:

1. A specific title, priority, and classification.
2. The surfaces and conditions being compared, with exact examples of their current behavior.
3. Source references for both sides, using `path:line` where possible.
4. The user consequence and the proposed consistency rule. Mark an undocumented rule as a recommendation, not an existing requirement.
5. Evidence and confidence: source-confirmed, headless-reproduced, or real-terminal-verified, with remaining uncertainty.

Group findings by category when helpful. Report one underlying cause as one finding. Do not invent findings to satisfy a count.

Finish with the audited scope, checks actually performed, important intentional differences, unverified behavior, and a short priority order. If implementation is requested, fix the agreed in-scope behavior, update affected consumers and documentation, and follow the [verification workflow](../../../docs/agents/verification.md). Preserve raw data contracts when changing presentation.
