# Semantic and visual hierarchy

[Return to the UI consistency audit](../SKILL.md).

Compare intended reading order with colour, weight, spacing, indentation, borders, position, and repetition. Recommend shared roles and layout where useful, while preserving differences justified by meaning.

## Reading order

Identify each surface's roles:

- **Context:** view or group heading.
- **Primary content:** subject, target, or selection.
- **State and outcome:** progress, result, or attention needed.
- **Supporting information:** counts, timestamps, dependencies, IDs, or annotations.
- **Available actions:** controls and recovery.

Use these roles as a comparison aid rather than a fixed layout. Actionable failures or safety confirmations may need priority; different meanings need not share row counts, components, or colours.

## Checks

- Keep identifiers and timestamps subordinate to their subject.
- Give repeated titles, badges, and labels enough context to justify their emphasis.
- Preserve relationships through connectors, indentation, wrapping, and continuations.
- Attach status, counts, and diagnostics to the item they describe.
- Keep selection apparent while retaining semantic styling.
- Preserve terminology and hierarchy during expansion.
- Prioritise identity, outcome, and controls over metadata in constrained views.

## Evidence

Annotate paired renders with roles and emphasis, including relevant selected, failed, narrow, and expanded states. Use role tables where useful and explain what distracts from the task. Preference alone is not a defect.
