# State and counts

[Return to the UI consistency audit](../SKILL.md).

Compare the same data across widgets, browsers, cards, and restored history.

## Checks

- Apply consistent definitions to totals, completion, filters, deleted items, and positions.
- Distinguish filtered positions, full indexes, and stable IDs.
- Compare the meanings of active, pending, running, completed, and unavailable states.
- Show only actual inheritance and blocking relationships in dependency and hierarchy views.
- Distinguish requested mutations from confirmed state, including pending and partial results.
- Preserve outcomes in live and historical views; distinguish missing data from zero or success.

## Evidence

Use a small shared fixture covering statuses, filters, hierarchy, and deletion. Calculate expected counts and compare equivalent lifecycle points. Separate freshness differences from arithmetic or labeling errors.
