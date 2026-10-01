# Bounded patch generation

[Library index](../../README.md#usage)

Compare two file versions without blocking the main thread, within caller-chosen byte and time budgets.

## Behaviour

[`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) asynchronously generates unified patches, normalising CRLF to LF and returning `binary` for NULs.

One shared off-main-thread worker serialises requests. Request timeouts exclude queue wait; startup has a separate deadline. An idle worker does not keep the process alive.

Active and waiting inputs share a bounded accounting budget, not a process-memory bound. Results use these statuses:

| Status             | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `ready`            | The `patch` field holds the unified diff.                             |
| `source-too-large` | Either source exceeds `maxSourceBytes`.                               |
| `binary`           | Either source contains NUL.                                           |
| `budget-exceeded`  | The timeout elapsed, the timeout is zero, or the edit budget ran out. |
| `patch-too-large`  | The patch exceeds `maxPatchBytes`.                                    |
| `queue-full`       | Admitting the request would exceed the shared accounting budget.      |
| `worker-failed`    | Worker startup, execution, or messaging failed.                       |

See the [processor](processor.ts) and [worker](worker.ts) for resource limits.

## Caller responsibilities

Supply one options object:

| Option            | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `path`            | Path used for the patch headers.                |
| `before`, `after` | The two source versions to compare.             |
| `maxSourceBytes`  | Byte limit applied to each source.              |
| `maxPatchBytes`   | Byte limit applied to the generated patch.      |
| `maxEditLength`   | Edit-distance budget for the comparison.        |
| `contextLines`    | Context lines kept around each change.          |
| `timeoutMs`       | Deadline for the request, excluding queue wait. |

Consult [`patchLimitsSchema`](index.ts) for accepted limits.

`PatchLimits` also applies to [file mutation observation](../file-mutations/README.md). Consumers own budget values and diagnostics.

The library does not read files. Use [file observation](../file-observation/README.md) to load complete UTF-8 source from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).
