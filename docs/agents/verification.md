# Verification and handoff

[Workspace development](../development.md)

1. Identify changed files, affected packages, and [shared-code consumers](architecture.md#reuse-decision).
2. Run the checks for the kind of change:
   - When you change Markdown, check the changed files with `vp fmt --check <files>` and `node .scripts/check-docs.ts <files>`. Vite+ formatting ignores `.agents/`, so leave those files out of `vp fmt --check`. Docs-only changes need no application tests.
   - For code or tooling changes, run these from the repository root with each affected package's `package.json` name, then follow the [testing convention](testing.md):

     ```sh
     vpr '<package-name>#check'
     vpr '<package-name>#test'
     ```

     `#check` runs the format check and type-aware lint, which type-checks the package. It does not run `check-docs.ts`. Run `#test` only when the package declares a `test` task; the website does not. For a package without one, do any documented manual validation and report that no tests ran.

     For workspace-wide and partial commands, see [focused validation](../development.md#focused-validation).
3. Review the final diff for correctness and scope.
4. Report:
   - the commands run, the files and packages checked, and the results;
   - failures that existed before the change;
   - behaviour that wasn't verified, and behaviour now protected by tests.

   If a test run executed no tests, say "no tests ran", including for packages that have no tests or intentionally don't need them.
