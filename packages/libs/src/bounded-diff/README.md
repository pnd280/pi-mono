# Bounded patch generation

[Library index](../../README.md#usage)

## Behavior

[`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) asynchronously generates unified patches, normalizing CRLF to LF and returning `binary` for NULs.

One shared off-main-thread worker serializes requests. Request timeouts exclude queue wait; startup has a separate deadline. An idle worker does not keep the process alive.

Active and waiting inputs share a bounded accounting budget, not a process-memory bound. Results distinguish oversized source/patches, binary input, exhausted budgets, full queue, and worker failure. See the [processor](processor.ts) and [worker](worker.ts) for resource limits.

## Caller responsibilities

Supply path, before/after source, source/patch byte limits, edit-distance limit, timeout, and context-line count. Consult [`patchLimitsSchema`](index.ts) for accepted limits.

`PatchLimits` also applies to [file mutation observation](../file-mutations/README.md). Consumers own budget values and diagnostics.

The library does not read files. Use [file observation](../file-observation/README.md) to load complete UTF-8 source from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).
