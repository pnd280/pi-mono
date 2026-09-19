# Destructive actions

[Consistency audit](../SKILL.md)

Compare the effects of deletion, clearing, and combined operations with user expectations. Confirmation requirements may differ when effects differ.

## Checks

- Do labels and confirmation identify the exact target and distinguish one occurrence, a subtree, a filtered result, and an entire collection?
- Are confirmation requirements and direct-command behavior documented and accurately advertised?
- Does navigation, resize, timeout, repeat input, or target replacement invalidate confirmation consistently?
- Is it clear whether cancellation stops the operation or only closes the view while the operation continues?
- For sequential operations, is order explicit and is partial success reported accurately?
- Are tombstones, permanent removal, and ID resets described according to their actual effects?

## Evidence

Use disposable data and inspect state before and after the relevant commit boundary. Include cancellation and partial failure where applicable. Compare effects with confirmation text and final feedback. Closing a view does not prove an operation was cancelled or rolled back.
