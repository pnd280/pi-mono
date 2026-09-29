# Workspace development

## Working agreement

- Make breaking changes directly; add compatibility support only when explicitly requested.
- Update affected consumers, tests, and docs; remove superseded implementations.
- Keep temporary artifacts in `.tmp/`, except [mutable filesystem fixtures](docs/agents/testing.md#filesystem-fixtures), which use the system temporary directory.
- Follow [documentation conventions](docs/development.md#documentation) and the [verification workflow](docs/agents/verification.md).

## Task references

| Task                                                                                                  | Guidance                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Change behavior or refactor                                                                           | [Code organization and reuse](docs/agents/architecture.md), [workspace architecture](docs/architecture.md) |
| Choose coverage, edit tests, or review tests                                                          | [Testing](docs/agents/testing.md)                                                                          |
| Validate changes, edit TypeScript or tooling, configure packages, update dependencies, or use Pi APIs | [Development](docs/development.md)                                                                         |
| Install the workspace or resolve prerequisites                                                        | [Setup](README.md#setup)                                                                                   |
