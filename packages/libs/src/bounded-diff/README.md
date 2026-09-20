# Bounded patch generation

[Library index](../../README.md#usage)

## Behavior

[`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) asynchronously generates unified patches, normalizing CRLF to LF and returning `binary` for NULs.

One shared off-main-thread worker handles requests serially. Request timeouts cover dispatch through patch return, excluding queue wait; startup has a separate one-second limit. Timed-out workers terminate before the next request.

Shared resource limits apply across consumers:

| Resource               | Limit                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pending requests       | Four, including the active request.                                                                         |
| Retained input strings | 64 MiB total, counted as UTF-16.                                                                            |
| Worker JavaScript heap | 64 MiB for the old generation and 16 MiB for the young generation. These do not bound total process memory. |

An idle worker does not keep the process alive.

Results distinguish oversized source, oversized patches, and binary input. Exceeding the edit-distance, time, heap, or queue limit returns `budget-exceeded`. Worker startup and execution failures return the same status without preventing later requests.

## Caller responsibilities

Supply path, before/after source, source/patch byte limits, edit-distance limit, timeout, and context-line count. Limits/count must be nonnegative safe integers; `timeoutMs` finite and nonnegative. Invalid values reject with `RangeError`.

The library does not read files. Use [file observation](../file-observation/README.md) to load complete UTF-8 source from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).

## Validation

Use the [package validation commands](../../README.md#validation).
