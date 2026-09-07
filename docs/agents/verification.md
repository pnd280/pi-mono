# Verification and handoff

1. **Select the scope.** Identify changed files and affected packages, including consumers of shared code under the [consumer verification rule](architecture.md#reuse-decision).
2. **Run focused checks.** Run formatting checks, `check`, and relevant tests for affected packages using the [development commands](../development.md#focused-validation). Follow the [testing convention](testing.md) for coverage and manual checks. For documentation-only changes, validate formatting and links in the changed files; package checks and tests are only needed if package behavior or tooling is affected.
3. **Review the final diff** for correctness and scope.
4. **Report the result.** Name the commands run, packages and files checked, results, pre-existing failures, and any unverified behavior. Follow the [test handoff requirements](testing.md#runner-and-handoff) when reporting coverage.
