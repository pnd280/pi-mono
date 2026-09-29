# Bounded patch generation

[Library index](../../README.md#usage)

## Behavior

[`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) asynchronously generates unified patches, normalizing CRLF to LF and returning `binary` for NULs.

One shared off-main-thread worker serializes requests. Request timeouts exclude queue wait; startup has a separate deadline. An idle worker does not keep the process alive.

Shared resource limits apply across consumers:

| Resource               | Limit                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Active and queued work | 64 MiB accounting budget: UTF-16 source/path strings plus a 1 KiB bookkeeping allowance per request.        |
| Worker JavaScript heap | 64 MiB for the old generation and 16 MiB for the young generation. These do not bound total process memory. |

Results distinguish oversized source/patches, binary input, exhausted budgets, full queue, and worker failure. The accounting budget is not a process-memory bound.

## Caller responsibilities

Supply path, before/after source, source/patch byte limits, edit-distance limit, timeout, and context-line count. Consult [`patchLimitsSchema`](index.ts) for accepted limits.

`PatchLimits` also applies to [file mutation observation](../file-mutations/README.md). Consumers own budget values and diagnostics.

The library does not read files. Use [file observation](../file-observation/README.md) to load complete UTF-8 source from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).

## Validation

Use the [package validation commands](../../README.md#validation).
