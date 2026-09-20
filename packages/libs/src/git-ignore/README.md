# Git ignore inspection

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/git-ignore`](index.ts) exports `inspectGitIgnore`, which inspects Git rules and symbolic-link targets without enumerating directories. One deadline covers repository discovery and link traversal.

## Caller responsibilities

Require Git on `PATH`; supply absolute `path`/`cwd`, a millisecond timeout, and optional cancellation. Injected `GitCommand` must honor its signal.

Use the result to apply the consumer's policy. The guard's [inspection policy](../../../extensions/pi-fff-guard/src/evaluate-search.ts) shows how to allow or block calls.

Never display an `unavailable` result's internal `cause`; choose safe consumer diagnostics.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
