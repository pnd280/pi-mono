# Layout

[User interface consistency audit](../SKILL.md)

Compare framing, spacing, and alignment at equivalent sizes/content. Features may need different row budgets.

## Checks

- Are titles, padding, spacing, borders, alignment, and density coherent?
- Do indentation, nesting, and wrapped continuations express real relationships?
- Do compact/expanded forms retain item identity, outcome, and diagnostics?
- Are truncation, hidden content, scroll, and further detail discoverable?
- Do narrow views preserve controls rather than discard later hints?
- Are inline/overlay placement, host clipping, and transcript visibility predictable?

## Evidence

Pair ordinary/constrained renders with long content. Start TUI checks at 80×24 and 40×10 where applicable; include documented thresholds and trigger dimensions. Record viewport, mode, and content; use terminal evidence for host clipping/placement.
