# Git ignore inspection

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/git-ignore`](index.ts) exports `inspectGitIgnore`, which inspects Git rules and symbolic-link targets without enumerating directories. One deadline covers repository discovery and link traversal.

The result describes ignore status, missing paths, cancellation, timeout, or unavailable inspection. It does not decide whether to allow or block a call.

## Caller responsibilities

Git must be available on `PATH`. Supply absolute `path` and `cwd` values, a timeout in milliseconds, and optional cancellation. An injected `GitCommand` must honor its signal.

Use the result to apply the consumer's policy. The guard's [inspection policy](../../../extensions/pi-fff-guard/src/evaluate-search.ts) shows how to allow or block calls.

The `cause` of an `unavailable` result is an internal diagnostic and is not safe to display. Choose user-facing messages in the consumer.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
