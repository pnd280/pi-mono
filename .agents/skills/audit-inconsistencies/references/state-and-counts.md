# State and counts

[User interface consistency audit](../SKILL.md)

Compare the same data across widgets, browsers, cards, and restored history.

## Checks

- Do totals, completion, filters, deleted items, and positions use consistent definitions?
- Are filtered positions, full indexes, and stable IDs distinct?
- Do active, pending, running, completed, and unavailable mean the same thing when compared?
- Do dependency/hierarchy views avoid implying nonexistent inheritance/blocking?
- Are requested mutations distinct from confirmed state, including pending/partial results?
- Do live/history views preserve outcomes and distinguish missing data from zero/success?

## Evidence

Use a small shared status/filter/hierarchy/deletion fixture. Calculate expected counts and compare equivalent lifecycle points; separate freshness differences from arithmetic/label errors.
