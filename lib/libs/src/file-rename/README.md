# File rename

[Library index](../../README.md#usage)

Replace a file by rename when another process, such as a reader or a virus scanner, can briefly hold it open on Windows. [`@pi-mono/libs/file-rename`](index.ts) exports `renameWithRetry` and `renameWithRetrySync`.

## Behaviour

- The functions behave like `rename` and `renameSync`, with one exception: on Windows, an `EPERM`, `EACCES`, or `EBUSY` error starts a retry.
- There are at most 10 attempts, with waits of 10 to 90 ms, 450 ms in total. The sync variant blocks the thread during the waits.
- After the last attempt, the function throws the last error.
- Other platforms and other errors throw at once.
- The functions never delete the target, so a failed rename keeps the previous file.

## Usage

```ts
import { renameWithRetry } from "@pi-mono/libs/file-rename";

await writeFile(temporary, content);
try {
  await renameWithRetry(temporary, target);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
```

## Caller responsibilities

- Remove the source after a failure if it must not remain.
- Use the sync variant only where a 450 ms block is acceptable, such as a short settings update under a lock.

Related: the [pi-subagents writer lease](../../../extensions/pi-subagents/src/history/lease.ts) uses `renameWithRetry`.
