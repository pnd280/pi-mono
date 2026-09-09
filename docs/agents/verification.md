# Verification and handoff

1. Identify changed files and affected packages, including consumers of shared code under the [consumer verification rule](architecture.md#reuse-decision).
2. Validate formatting and links in changed documents. For code or tooling changes, also run formatting checks, `check`, and relevant tests for affected packages using the [development commands](../development.md#focused-validation). Follow the [testing convention](testing.md) for coverage and manual checks.
3. Review the final diff for correctness and scope.
4. Name the commands run, packages and files checked, results, pre-existing failures, and any unverified behavior. For tests, include protected behaviors. If a test run executed no tests, report **no tests ran**, whether packages were absent or explicitly test-free.
