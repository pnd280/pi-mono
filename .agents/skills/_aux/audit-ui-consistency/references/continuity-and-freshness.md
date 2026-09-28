# Continuity and freshness

[Return to the UI consistency audit](../SKILL.md).

Compare navigation state retention and data freshness.

## Checks

- Compare selection, query, scroll, focus, and draft retention across details, resize, view switches, reopening, reload, and session restoration.
- Preserve one logical view and workflow across responsive remounts.
- Verify the purpose of deliberate resets, such as resize cancelling destructive confirmation.
- Distinguish snapshots from live data and make refresh discoverable.
- Handle changed or missing selections predictably; keep actions bound to the intended item rather than silently retargeting them.
- Protect stale views and replacement sessions from asynchronous results.

## Evidence

Record transition sequences and before/after state for equivalent surfaces. Separate intentional persistence differences from accidental loss. Use host checks for restoration and focus behavior that components cannot establish.
