# Commit messages

Use Conventional Commits with a required scope:

```text
<type>(<scope>): <summary>
```

## Scope

- **One package:** its exact `package.json` name, including the namespace.
- **Several packages:** all affected manifest names, comma-separated without spaces, for one coherent change. Split unrelated changes into separate commits.
- **Root only:** `repo`, including changes to shared tooling or root documentation.

## Message

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- Header: at most 72 characters; imperative summary without a trailing period.
- Body: explain non-obvious reasons for the change.
- Mark breaking changes with `!` before `:` and explain them in a `BREAKING CHANGE:` footer.
