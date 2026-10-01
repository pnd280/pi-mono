# FFF guard coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). For maintainers: this package tests scope intersection and exclusion, the missing-target policy, allow and block decisions, late registration, and notification delivery.

## Contracts

Contracts split by decision stage: what gets intercepted, which targets count as explicit paths, how scopes combine, and the final allow or block outcome.

### Interception

- Only official FFF registrations are intercepted, including override names and tools registered after startup. Built-ins and lookalikes pass through.
- Arguments, registrations, and active tools are never changed, and no replacement search is run.

### Missing targets

- Missing explicit targets are blocked before ignore inspection.
- Recursive filename filters are not explicit local files.
- Rooted globs need a root that exists, not matching files.
- Files and other non-directory objects cannot satisfy directory-only scopes or glob roots. An existing unsupported object, such as a FIFO, is not reported as a missing file.
- Missing-target precedence survives a fully excluded search.

### Scopes

- Extraction follows FFF syntax, finite alternatives, exclusions, hidden-file rules, and intersecting constraints.
- Shared FFF expression parsing supplies explicit-path and directory intent; the guard owns filesystem errors, limits, missingness, and exclusion application.
- Exclusions apply to their matching positive scope, without losing an ignored target that is still searchable.
- Retained alternatives sharing a lexical root receive one Git inspection, in first-seen order after exclusions.
- Ordinary explicit targets and fixed glob roots avoid duplicate resolution probes; subsequent Git inspection still rechecks existence.

### Decisions

| Situation                                                          | Result                        |
| ------------------------------------------------------------------ | ----------------------------- |
| Ignored target                                                     | Blocked, with retry guidance. |
| Malformed scope, Git failure, traversal limit, two-second deadline | Allowed, with a diagnostic.   |
| Caller cancellation                                                | Blocked.                      |

- Calls settle even if scope extraction or Git inspection ignores the abort.
- Existence and ignore state are checked again on every call.
- Non-missing filesystem failures in positive scopes and exclusions allow the call with a diagnostic.
- Malformed scope fields retain field-specific diagnostics, including string-or-array guidance for `exclude`.
- Diagnostics contain no terminal controls or internal Git errors.

## How to test

Use disposable repositories to check integration with the shared helpers, without repeating the shared Git matrix. The unsupported-target check requires the Unix `mkfifo` command.

## Not covered here

- Whether FFF itself indexes and searches correctly.
- Paid model calls.

Keep the fixture-isolation checks where the fixture itself runs Git. Without them, inherited Git selectors could modify a real repository. They protect test safety, not guard behaviour.
