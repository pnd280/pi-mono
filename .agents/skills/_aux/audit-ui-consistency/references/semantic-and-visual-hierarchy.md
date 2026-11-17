# Semantic and visual hierarchy

[Return to the UI consistency audit](../SKILL.md).

Compare intended reading order with colour, weight, spacing, indentation, borders, position, and repetition. Recommend shared roles and layout where useful, while preserving differences justified by meaning.

## Reading order

Identify each surface's roles:

| Role                   | Content                                               |
| ---------------------- | ----------------------------------------------------- |
| Context                | View or group heading                                 |
| Primary content        | Subject, target, or selection                         |
| State and outcome      | Progress, result, or attention needed                 |
| Supporting information | Counts, timestamps, dependencies, IDs, or annotations |
| Available actions      | Controls and recovery                                 |

Use these roles as a comparison aid rather than a fixed layout. Actionable failures and safety confirmations can take priority.

## Checks

- Keep identifiers and timestamps subordinate to their subject.
- Give repeated titles, badges, and labels enough context to justify their emphasis.
- Preserve relationships through connectors, indentation, wrapping, and continuations.
- Attach status, counts, and diagnostics to the item they describe.
- Preserve terminology and hierarchy during expansion.

## Evidence

Annotate paired renders with roles and emphasis, including relevant selected, failed, narrow, and expanded states. Use role tables where useful and explain what distracts from the task.
