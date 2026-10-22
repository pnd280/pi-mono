# FFF guard test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests interception, the missing-target and ignore policy, and allow and block decisions; utils owns scope parsing and FFF provenance.

## Must not regress

Fixtures that run Git keep their isolation checks, so inherited Git selectors cannot change a real repository.

- **Critical, integration:** Fixture Git commands never write to a repository, index, or configuration selected by inherited `GIT_*` environment variables.
- **Critical, unit:** Delivered diagnostics contain no terminal controls.
- **High, unit:** Only official FFF registrations are intercepted, including override names and tools registered after startup.
- **High, unit:** Built-in tools and lookalike registrations pass through.
- **High, unit:** The guard leaves arguments, registrations, and active tools unchanged, and runs no replacement search.
- **High, integration:** Missing explicit targets, including missing glob roots and files given as directory-only scopes, are blocked before ignore inspection, even when the search is fully excluded.
- **High, integration:** Ignored targets that stay searchable after exclusions, including rooted globs and files that a glob's `*` reaches across `/`, are blocked with guidance to retry using another tool.
- **High, integration:** Exclusions apply only to their matching positive scope.
- **High, integration:** Existence and ignore state are checked again on every call.
- **High, integration:** Ignore inspection follows Git's effective rules: negations, tracked exceptions, local and global excludes, nested and external repositories, linked worktrees, and symbolic links as FFF indexes them.
- **High, integration:** A missing target reports missing even under an ignored parent.
- **High, unit:** Caller cancellation blocks the call.
- **High, unit:** Calls settle at the two-second deadline even if scope extraction or Git inspection ignores the abort.
- **High, unit:** Diagnostics do not expose internal Git errors.

## Not tested

- Exact probe counts, inspection order, and malformed-field diagnostics are below the severity bar.
- FFF owns whether its index and searches are correct.
