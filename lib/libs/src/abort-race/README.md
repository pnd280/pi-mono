# Abort race

[Library index](../../README.md#usage)

Stop waiting for an operation when its abort signal fires.

## Behaviour

[`raceWithAbortSignal(operation, signal)`](index.ts) (`@pi-mono/libs/abort-race`) settles like `operation` until `signal` aborts. After that, it rejects with the signal's reason and ignores the later result of `operation`, including a rejection. When `signal` is already aborted, it rejects at once.

## Caller responsibilities

Abort the underlying work separately, for example by passing the same signal to the operation. This function only stops the wait.
