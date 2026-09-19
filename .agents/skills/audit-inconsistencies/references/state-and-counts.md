# State and counts

[Consistency audit](../SKILL.md)

Compare representations of the same underlying data across widgets, browsers, tool cards, and restored history.

## Checks

- Do totals, completion counts, filters, deleted-item handling, and selection positions use the same definitions?
- Are filtered-result positions distinguished from full-collection indexes and stable identifiers?
- Do terms such as active, pending, running, completed, and unavailable mean the same thing where they are compared?
- Are dependencies and hierarchy shown without implying status inheritance or blocking behavior that does not exist?
- Does a summary distinguish a requested mutation from confirmed state? Check pending arguments and partial results.
- Do live and historical representations preserve known outcomes and distinguish missing information from zero or success?

## Evidence

Use a small shared fixture containing the relevant statuses, filters, hierarchy, and deleted items. Calculate expected counts explicitly and compare each surface at the same point in the lifecycle. Treat differences in data freshness separately from incorrect arithmetic or labels.
