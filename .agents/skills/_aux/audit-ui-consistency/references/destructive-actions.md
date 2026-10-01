# Destructive actions

[Return to the UI consistency audit](../SKILL.md).

Compare deletion, clearing, and combined effects with advertised behaviour. Different effects may justify different confirmation.

## Checks

- Identify the exact target in labels and confirmation: occurrences, subtrees, filtered results, or entire collections.
- Match documentation and hints to confirmation and direct-command behaviour.
- Compare confirmation invalidation on navigation, resize, timeout, repeated input, and target replacement.
- Distinguish closing a surface from cancelling an operation. Closure alone proves neither cancellation nor rollback.
- Make sequential order and partial success explicit.
- Match tombstone, permanent-removal, and ID-reset descriptions to actual effects.

## Evidence

Use disposable state to compare before and after each commit boundary, including cancellation and partial failure. Pair actual effects with confirmation text and feedback.
