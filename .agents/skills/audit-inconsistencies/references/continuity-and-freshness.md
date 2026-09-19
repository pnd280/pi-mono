# Continuity and freshness

[Consistency audit](../SKILL.md)

Compare the state users retain when navigating and the freshness of the data they see.

## Checks

- Do selection, query, scroll position, focus, and unsaved changes behave predictably when opening and returning from details? Check resizing, switching views, reopening, reloading, and restoring sessions too.
- Does responsive remounting preserve one logical view without restarting the workflow?
- Are deliberate resets, such as invalidating a destructive confirmation on resize, consistent with their purpose?
- Can the user distinguish live data from a snapshot and discover how to refresh it?
- When the selected item changes or disappears, does selection move to a predictable nearby item without silently applying an action to it?
- Do asynchronous results avoid updating stale views or replacement sessions?

## Evidence

Record a short transition sequence with the relevant state before and after each step. Compare equivalent transitions between surfaces, and separate intended persistence differences from accidental state loss. Use host-level checks for restoration or focus behavior that component-only rendering cannot establish.
