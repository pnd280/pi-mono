# Layout

[Return to the UI consistency audit](../SKILL.md).

Compare equivalent sizes and content. Different features may need different row budgets.

## Checks

- Compare titles, padding, spacing, borders, alignment, and density against project conventions.
- Check that indentation, nesting, and wrapped continuations express real relationships.
- Preserve item identity, outcome, and diagnostics in compact and expanded forms.
- Make truncation, hidden content, scrolling, and routes to further detail discoverable.
- Keep controls available in narrow views, including hints later in the reading order.
- Check inline/overlay placement, host clipping, and transcript visibility for predictable behaviour.

## Evidence

Pair ordinary and constrained renders using long content. Start applicable TUI checks at 80×24 and 40×10; include documented thresholds and dimensions that trigger the candidate. Record viewport, mode, and content. Verify host clipping and placement in a terminal.
