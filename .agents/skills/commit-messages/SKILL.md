---
name: commit-messages
description: "Commit messages: use when composing or reviewing a message, including during commit preparation."
---

# Commit messages

Validate the message against the complete diff it describes and every applicable rule below.

## Header

Use Conventional Commits with a required scope:

```text
<type>(<scope>): <summary>
```

- **Type:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- **Summary:** imperative, without a trailing period.
- **Length:** at most 72 characters for the entire header, including type, scope, and punctuation.

## Scope

- **One package:** its exact `package.json` name, including the namespace.
- **Several packages:** all affected manifest names, comma-separated without spaces, for one coherent change. Split unrelated changes into separate commits.
- **Root only:** `repo`, including changes to shared tooling or root documentation.

## Body and breaking changes

- **Body:** explain non-obvious reasons for the change.
- **Breaking changes:** insert `!` before `:` in the header and describe the incompatibility in a `BREAKING CHANGE:` footer.
