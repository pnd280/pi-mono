# Abort race

[Library index](../../README.md#usage)

Stop waiting for an operation when its abort signal fires. [`raceWithAbortSignal(operation, signal)`](index.ts) (`@pi-mono/libs/abort-race`) does this for one promise.

## Behaviour

- The returned promise settles like `operation` until `signal` aborts.
- After the abort, it rejects with the signal's reason and ignores the later result of `operation`, including a rejection.
- When `signal` is already aborted, it rejects at once.

## Usage

```ts
import { raceWithAbortSignal } from "@pi-mono/libs/abort-race";

// Pass the same signal to the operation, so that the work stops too.
const title = await raceWithAbortSignal(completeTitle({ ...request, signal }), signal);
```

## Caller responsibilities

Abort the underlying work separately, for example by passing the same signal to the operation. This function only stops the wait.
