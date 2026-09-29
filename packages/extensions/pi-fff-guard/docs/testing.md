# FFF guard coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Intercept only official FFF registrations, including override names and tools registered after startup; built-ins and lookalikes pass through. Leave arguments, registrations, and active tools unchanged, and never run replacement searches.
- Missing explicit targets block before ignore inspection. Recursive filename filters are not explicit local files; rooted globs need viable roots, not matching files.
- Scope extraction follows FFF syntax, finite alternatives, exclusions, hidden-file rules, and intersecting constraints. Apply exclusions to the corresponding positive scope without losing an ignored target that remains searchable.
- Ignored targets block with retry guidance. Malformed scopes, Git failures, traversal limits, and the two-second deadline allow the call with diagnostics; caller cancellation blocks it. Settle even if inspection ignores abort. Recheck existence and ignore state on each invocation.
- Diagnostics omit terminal controls and internal Git errors.

## Coverage boundaries

This package owns scope intersection/exclusion and missing-target policy, allow/block decisions, late registration, and notification delivery. [Utils](../../../utils/docs/testing.md) own FFF provenance, finite braces, fixed prefixes, and path normalization; [libraries](../../../libs/docs/testing.md) own Git rule precedence, worktrees, NUL protocols, and symlink traversal. Use disposable repositories to check their integration without repeating the shared Git matrix.

## Exclusions

No upstream FFF indexing/search correctness or paid model calls. Preserve fixture-isolation checks where the fixture itself invokes Git: inherited Git selectors could otherwise modify a real repository. They protect test safety, not guard behavior.
