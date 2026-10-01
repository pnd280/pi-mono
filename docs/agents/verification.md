# Verification and handoff

[Workspace development](../development.md)

1. Identify changed files, affected packages, and [shared-code consumers](architecture.md#reuse-decision).
2. Run the checks for the kind of change:
   - For docs-only changes, check formatting of the changed Markdown files (`vp fmt --check <files>`) and their links. No application tests are needed.
   - For code or tooling changes, run formatting checks, `check`, and the relevant package tests. Use the [development commands](../development.md#focused-validation) and the [testing convention](testing.md).
3. Review the final diff for correctness and scope.
4. Report:
   - the commands run, the files and packages checked, and the results;
   - failures that existed before the change;
   - behaviour that wasn't verified, and behaviour now protected by tests.

   If a test run executed no tests, say "no tests ran", including for packages that have no tests or intentionally don't need them.
