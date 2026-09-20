# Pi API reuse

[Reusability audit](../SKILL.md)

Compare local modules, helpers, types, fixtures, and TUI with installed public Pi APIs, alongside [public API checks](public-apis.md).

## Checks

- Do text-block extraction, formatting, key labels, path discovery, or terminal helpers duplicate a public Pi API?
- Do handwritten types mirror exported Pi contracts, including inline tool-renderer parameter shapes?
- Can message and tool-call constructors, zero-usage objects, provider registration, or stream-event emission reuse Pi without changing explicit tool-call IDs, model identity, timestamps, borrowed arguments, or independent usage objects?
- Do constructor and streaming paths preserve start, delta, and end ordering, partial and final results, repeat requests, context-derived scenarios, and abort or error classification?
- Would reuse introduce global themes or keybindings, package-directory environment overrides, different clipboard transports, process execution, credentials, or network behavior?
- Do bounded output and diffs retain head-and-tail policies, terminal sanitization, UTF-8 and grapheme safety, cooperative text layout, and cancellation during expensive work?
- Can selection, scrolling, wrapping, borders, highlighting, diff rendering, or layout composition delegate to Pi? Compare standalone rendering with layout-engine participation, viewport clipping, controlled state, asynchronous preparation, mouse coordinates, image ownership, invalidation, disposal, and restoration.

## Evidence

Record consumer-resolved Pi versions; CLI/workspace versions may differ. Inspect installed metadata, export maps, declarations, and implementation; unresolved contracts stay unresolved.

Verify exact specifiers/symbols, distinguishing public roots/subpaths from internals. Never modify installed/upstream Pi or add internal deep imports to remove helpers.

Names prove no equivalence. Compare constructor/stream behavior separately, including cancellation/failure. Preserve required consumer policy/adapters even when partly delegating.
