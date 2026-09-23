# Bounded patch generation

[Library index](../../README.md#usage)

## Behavior

[`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) asynchronously generates unified patches, normalizing CRLF to LF and returning `binary` for NULs.

One shared off-main-thread worker handles requests serially in FIFO order. Request timeouts cover dispatch through patch return, excluding queue wait; startup has a separate one-second limit. Timed-out or failed workers terminate before the next request.

Shared resource limits apply across consumers:

| Resource               | Limit                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Active and queued work | 64 MiB accounting budget: UTF-16 source/path strings plus a 1 KiB bookkeeping allowance per request.        |
| Worker JavaScript heap | 64 MiB for the old generation and 16 MiB for the young generation. These do not bound total process memory. |

An idle worker does not keep the process alive.

Results distinguish oversized source, oversized patches, and binary input. Exceeding the edit-distance or request-time limit returns `budget-exceeded`. Requests that cannot fit the queue's accounting budget return `queue-full` without retaining their inputs. The bookkeeping allowance also bounds the number of tiny or empty queued requests; it is not an exact process-memory measurement.

Worker startup failures (including the startup deadline), execution errors, and heap exhaustion return `worker-failed`. Every completed request releases its queue allowance, and failures do not prevent waiting or later requests from running.

## Caller responsibilities

Supply path, before/after source, source/patch byte limits, edit-distance limit, timeout, and context-line count. Limits/count must be nonnegative safe integers; `timeoutMs` finite and nonnegative. Invalid values reject with `RangeError`. Additional option fields are ignored.

`PatchLimits` and `patchLimitsSchema`, exported from `@pi-mono/libs/bounded-diff`, define the same limits for patch generation and [file mutation observation](../file-mutations/README.md). Consumers retain ownership of their budget values and diagnostics.

The library does not read files. Use [file observation](../file-observation/README.md) to load complete UTF-8 source from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).

## Validation

Use the [package validation commands](../../README.md#validation).
