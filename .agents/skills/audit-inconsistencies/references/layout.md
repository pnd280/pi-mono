# Layout

[Consistency audit](../SKILL.md)

Compare framing, spacing, and alignment with equivalent viewports and content. Different features may need different row budgets.

## Checks

- Are title placement, padding, spacing, borders, alignment, and row density coherent across related surfaces?
- Do indentation and nesting express actual relationships, including wrapped continuation rows?
- Do compact and expanded forms preserve each item's identity, outcome, and associated diagnostics?
- Are truncation, hidden content, scroll position, and the route to additional detail discoverable?
- Do narrow layouts retain essential controls instead of silently discarding later hints?
- Are inline and overlay placement rules predictable? Check consequences for host clipping and transcript visibility.

## Evidence

Compare paired renders at ordinary and constrained widths and heights, including long content. For TUI checks, start at 80 × 24 and 40 × 10 when applicable. Also test documented thresholds and the dimensions that trigger the suspected inconsistency. Record viewport, mode, and content. Use real-terminal evidence for host clipping or placement claims.
