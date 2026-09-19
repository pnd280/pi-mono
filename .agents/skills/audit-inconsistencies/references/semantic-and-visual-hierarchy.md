# Semantic and visual hierarchy

[Consistency audit](../SKILL.md)

Compare the intended reading order with the emphasis created by color, weight, spacing, indentation, borders, position, and repetition.

## Reading order

For each surface, identify:

1. **Context:** where the user is, such as a view or group heading.
2. **Primary content:** the subject, target, or selected content.
3. **State and outcome:** what is happening, what happened, or what needs attention.
4. **Supporting information:** counts, timestamps, dependencies, IDs, and annotations.
5. **Available actions:** controls and recovery instructions.

This order is a comparison aid, not a rigid layout. An actionable failure or safety-critical confirmation may need greater prominence than ordinary content.

## Checks

- Do identifiers or timestamps visually outweigh the subject they describe?
- Do repeated titles, badges, or labels compete without adding context?
- Do tree connectors and indentation express actual relationships? Do wrapping and continuation rows preserve those relationships?
- Do status, counts, and diagnostics remain attached to the item they describe?
- Does selection remain apparent while retaining the item's semantic styling?
- Does expansion add detail within the same hierarchy, or switch to unrelated terminology and emphasis?
- When space is constrained, are identity, outcome, and essential controls preserved before secondary metadata?

Recommend shared semantic roles and layout rules where appropriate. Do not require identical row counts, a single component, or one color for concepts with different meanings merely to make surfaces look alike.

## Evidence

Annotate paired renders with each element's role and actual emphasis. Include relevant selected, failed, narrow, and expanded forms, and a table of roles when useful. Explain which element draws attention away from the user's task. Stylistic preference alone does not establish a hierarchy defect.
