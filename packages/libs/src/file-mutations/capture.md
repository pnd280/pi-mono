# File mutation capture and patches

[File mutation observation](README.md)

Read this when you interpret mutation sources, outcomes, and patches. The pre-read, the missing post-write read, and the failed-write rule are in the [README behaviour](README.md#behaviour).

## Source capture

- `before` and `after` are [`FileObservation`](observation.ts) values: complete UTF-8 source or a refusal.
- A `ready` observation holds the whole file and preserves BOMs.
- Invalid UTF-8, nonregular, oversized, changed, missing, and unreadable files return a status without text.
- Source reads follow symlinks without permission repair.
- Write pre-reads refuse nonregular files such as FIFOs without blocking.
- Edits reuse Pi's native read, so the source limit bounds the retained text, not the read.
- Size and timestamp checks are not atomic snapshots.

## Outcomes

A successful disk write keeps its success outcome even if Pi cancellation or middleware intervenes later.

## Patches

- `patch(limits)` accepts `PatchLimits` from [bounded-diff](../bounded-diff/README.md) and throws `RangeError` for invalid limits.
- A valid native edit patch can be reused without applying the source or generation limits, but it must fit the requested patch limit.
- Without a native patch, `patch()` returns `source-unavailable` when either observation is neither `ready` nor `missing`.

## Callbacks

Completion callbacks run outside Pi's mutation queue.

## Custom definitions

Use `observeMutationDefinition()` only for an already verified local native definition. Do not apply it to SDK tool overrides or custom tool implementations. Pi's public factories keep control of mutation semantics and queue ordering.
