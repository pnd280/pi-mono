# Verification and handoff

[Workspace development](../development.md)

1. Identify changed files, affected packages, and [shared-code consumers](architecture.md#reuse-decision).
2. Check changed documents' formatting and links. For code or tooling, also run formatting checks, `check`, and relevant package tests using the [development commands](../development.md#focused-validation) and [testing convention](testing.md).
3. Review the final diff for correctness and scope.
4. Report commands, checked files and packages, results, pre-existing failures, and unverified behavior. Name behaviors protected by tests. If a test run executed none, report **no tests ran**, including absent or intentionally test-free packages.
