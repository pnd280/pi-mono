# Pi API reuse

[Return to the reusability audit](../SKILL.md).

Apply these domain checks after the [public API checks](public-apis.md). Resolve Pi from each consumer: CLI and workspace versions can differ. Inspect the matching installed documentation and implementation without modifying installed or upstream Pi.

## Helpers and types

- Compare text-block extraction, formatting, key labels, path discovery, and terminal helpers with public Pi APIs.
- Check handwritten contracts, including inline tool-renderer parameter shapes, against exported Pi types.
- Trace changes to global themes/keybindings, package-directory environment overrides, clipboard transports, process execution, credentials, and network behavior.

## Fixtures and providers

- Compare message/tool-call constructors, zero-usage objects, provider registration, and stream-event emission.
- Preserve explicit tool-call IDs, model identity, timestamps, borrowed arguments, and independent usage objects.
- Check constructors and streaming paths separately: start/delta/end ordering, partial/final results, repeat requests, context-derived scenarios, and abort/error classification.

## TUI behavior

- Compare selection, scrolling, wrapping, borders, highlighting, diff rendering, and layout composition with Pi components.
- Distinguish standalone rendering from layout-engine participation. Check viewport clipping, controlled state, asynchronous preparation, mouse coordinates, image ownership, invalidation, disposal, and restoration.
- Preserve bounded-output and diff policies, including head-and-tail retention, terminal sanitization, UTF-8/grapheme safety, cooperative layout, and cancellation during expensive work.

Record the affected Pi version, exact public API, and contract differences for each finding. Keep required consumer adapters or policy even when other behavior can delegate to Pi.
