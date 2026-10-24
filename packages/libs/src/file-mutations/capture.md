# File mutation capture and patches

[File mutation observation](README.md)

This reference is for library callers who interpret mutation sources, outcomes, and patches. The [README](README.md#behaviour) summarises them.

## Source capture

- Writes take a bounded pre-read inside Pi's mutation queue.
- There is no post-write read, so `after` excludes later external changes.
- `before` and `after` are [`FileObservation`](observation.ts) values: complete UTF-8 source or a refusal.
- A `ready` observation holds the whole file and preserves BOMs.
- Invalid UTF-8, nonregular, oversized, changed, missing, and unreadable files return a status without text.
- Source reads follow symlinks without permission repair.
- Source reads refuse nonregular files such as FIFOs without blocking.
- Size and timestamp checks are not atomic snapshots.

## Outcomes

- Only attempted disk writes produce mutations.
- A successful disk write keeps its success outcome even if Pi cancellation or middleware intervenes later.
- For a failed write, `after` is the proposed content, not confirmed content.

## Patches

- `patch(limits)` accepts `PatchLimits` from [bounded-diff](../bounded-diff/README.md) and throws `RangeError` for invalid limits.
- A valid native edit patch can be reused without applying the source or generation limits, but it must fit the requested patch limit.
- Without a native patch, `patch()` returns `source-unavailable` when either observation is neither `ready` nor `missing`.

## Callbacks

Completion callbacks run outside Pi's mutation queue and settle before the tool returns. Callback failures do not change tool execution or other observers.

## Custom definitions

Use `observeMutationDefinition()` only for an already verified local native definition. Do not apply it to SDK tool overrides or custom tool implementations. Pi's public factories keep control of mutation semantics and queue ordering.
