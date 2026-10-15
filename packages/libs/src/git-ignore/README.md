# Git ignore inspection

[Library index](../../README.md#usage)

Decide whether a path is ignored before searching or reading it, without enumerating directories.

## Behaviour

[`@pi-mono/libs/git-ignore`](index.ts) exports `inspectGitIgnore`, which inspects Git rules and symbolic-link targets without enumerating directories. One deadline covers repository discovery and link traversal.

Results have the status `ignored`, `not-ignored`, `missing`, `cancelled`, `timed-out`, or `unavailable`. A path that does not exist returns `missing`, even when an existing parent is ignored.

## Caller responsibilities

Git must be on `PATH`. Supply absolute `path` and `cwd` values, a positive integer `timeoutMs` up to 2,147,483,647, and an optional `signal`. Relative paths throw `TypeError`, and other timeouts throw `RangeError`. An injected `GitCommand` must honour its signal.

Use the result to apply the consumer's policy. The guard's [inspection policy](../../../extensions/pi-fff-guard/src/evaluate-search.ts) shows how to allow or block calls.

Never display an `unavailable` result's internal `cause`. Choose safe consumer diagnostics.
