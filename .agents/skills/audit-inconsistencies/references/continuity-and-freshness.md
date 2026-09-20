# Continuity and freshness

[User interface consistency audit](../SKILL.md)

Compare navigation state retention and data freshness.

## Checks

- Are selection, query, scroll, focus, and drafts predictable across details, resize, view switches, reopening, reload, and session restoration?
- Do responsive remounts preserve one logical view/workflow?
- Do deliberate resets, such as resize cancelling destructive confirmation, serve their purpose?
- Are snapshots distinct from live data, with discoverable refresh?
- Does changed/missing selection move predictably without silently targeting actions at another item?
- Are stale views/replacement sessions protected from async results?

## Evidence

Record transition sequences with before/after state; compare equivalent surfaces. Separate intended persistence differences from accidental loss. Use host checks for restoration/focus that components cannot establish.
