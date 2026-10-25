# Bounded patch generation

[Library index](../../README.md#usage)

Compare two file versions without blocking the main thread, within caller-chosen byte and time budgets. [`createBoundedPatch`](index.ts) (`@pi-mono/libs/bounded-diff`) returns a unified patch or a status that says why there is none.

## Behaviour

`createBoundedPatch` asynchronously generates unified patches, normalising CRLF to LF and returning `binary` for NULs. The library does not read files; callers supply complete source text.

One shared off-main-thread worker serialises requests. Request timeouts exclude queue wait. Worker startup has a separate 5-second deadline, so a request that starts a worker can wait that long before its own timeout begins. An idle worker does not keep the process alive.

Active and waiting inputs share a bounded accounting budget, not a process-memory bound. See the [processor](processor.ts) and [worker](worker.ts) for resource limits. Results use these statuses:

| Status             | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `ready`            | The `patch` field holds the unified diff.                             |
| `source-too-large` | Either source exceeds `maxSourceBytes`.                               |
| `binary`           | Either source contains NUL.                                           |
| `budget-exceeded`  | The timeout elapsed, the timeout is zero, or the edit budget ran out. |
| `patch-too-large`  | The patch exceeds `maxPatchBytes`.                                    |
| `queue-full`       | Admitting the request would exceed the shared accounting budget.      |
| `worker-failed`    | Worker startup, execution, or messaging failed.                       |

## Usage

```ts
import { createBoundedPatch } from "@pi-mono/libs/bounded-diff";

const result = await createBoundedPatch({
  path: "src/index.ts",
  before,
  after,
  maxSourceBytes: 1024 * 1024,
  maxPatchBytes: 64 * 1024,
  maxEditLength: 10_000,
  contextLines: 3,
  timeoutMs: 2000
});

if (result.status === "ready") show(result.patch);
else warn(`No diff: ${result.status}`);
```

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

- Choose budget values. See [`patchLimitsSchema`](index.ts) for accepted limits. Invalid limits throw `RangeError`.
- Classify the change and translate result statuses into diagnostics in the consumer.

Related: `PatchLimits` also applies to [file mutation observation](../file-mutations/README.md); patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [tool-display diff view](../../../extensions/pi-tool-display/src/rendering/diff-view/README.md).
