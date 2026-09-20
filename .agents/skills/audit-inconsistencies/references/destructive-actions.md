# Destructive actions

[User interface consistency audit](../SKILL.md)

Compare deletion, clearing, and combined effects with expectations. Different effects may justify different confirmation.

## Checks

- Do labels/confirmation identify occurrences, subtrees, filtered results, or entire collections precisely?
- Are confirmation and direct-command behavior documented/advertised accurately?
- Do navigation, resize, timeout, repeats, and target replacement invalidate confirmation consistently?
- Is closing distinguished from cancelling an operation?
- Are sequential order and partial success explicit?
- Do tombstone, permanent-removal, and ID-reset descriptions match effects?

## Evidence

Use disposable before/after state at commit boundaries, including cancellation/partial failure. Compare effects, confirmation, and feedback. Closure proves neither cancellation nor rollback.
