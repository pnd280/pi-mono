# FFF guard test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests interception, the missing-target and ignore policy, and allow and block decisions. Utils owns scope parsing and FFF provenance. Fixtures that run Git keep their isolation checks, so inherited Git selectors cannot change a real repository.

## Must not regress

- **High, unit:** Only official FFF registrations are intercepted, including override names and tools registered after startup. Built-ins and lookalikes pass through.
- **High, unit:** The guard leaves arguments, registrations, and active tools unchanged, and runs no replacement search.
- **High, integration:** Missing explicit targets are blocked before ignore inspection, even when the search is fully excluded.
- **High, integration:** Ignored targets that stay searchable after exclusions are blocked with guidance to retry using another tool. Exclusions apply only to their matching positive scope.
- **High, integration:** Existence and ignore state are checked again on every call.
- **High, integration:** Ignore inspection follows Git's effective rules: negations, tracked exceptions, local and global excludes, nested and external repositories, linked worktrees, and symbolic-link destinations. A missing target reports missing even under an ignored parent.
- **High, unit:** Caller cancellation blocks the call, and calls settle at the two-second deadline even if scope extraction or Git inspection ignores the abort.
- **Critical, unit:** Delivered diagnostics contain no terminal controls.
- **High, unit:** Diagnostics do not expose internal Git errors.

## Not tested

- Glob roots, directory-only scopes, probe counts, inspection order, and malformed-field diagnostics: below the severity bar.
- Whether FFF itself indexes and searches correctly: owned by FFF.
