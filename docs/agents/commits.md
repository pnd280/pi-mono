# Commit messages

Use Conventional Commits with a required scope:

```text
<type>(<scope>): <summary>
```

## Scope

Read the affected manifests before choosing the scope:

- **One package:** its exact `package.json` name, including the namespace. Apply this to nested extension packages as well.
- **Several packages:** all affected manifest names, comma-separated without spaces, for one coherent change. Split unrelated changes into separate commits.
- **Root only:** `repo`, including changes to shared tooling or root documentation.

## Message

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- Header: at most 72 characters; imperative summary without a trailing period.
- Body: explain non-obvious reasons for the change.
- Mark breaking changes with `!` before `:` and explain them in a `BREAKING CHANGE:` footer.

Examples using hypothetical manifest names:

```text
feat(@pi-dev/search): add result filtering
fix(@pi-dev/tui-components): preserve selection on resize
refactor(@pi-dev/search,@pi-dev/utils): share normalization
docs(repo): establish working conventions
```
