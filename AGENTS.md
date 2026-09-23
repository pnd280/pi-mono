# Workspace development

## Working agreement

- Change APIs, configuration, and behavior without compatibility layers, deprecated aliases, legacy paths, or transitional support unless explicitly requested.
- Update affected consumers, tests, and docs together; remove superseded implementations.
- All temporary artifacts must be in `.tmp/`.
- Follow [documentation conventions](docs/development.md#documentation) and the [verification workflow](docs/agents/verification.md).

## Task references

| Task                                                                                                  | Guidance                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Change behavior or refactor                                                                           | [Code organization and reuse](docs/agents/architecture.md), [workspace architecture](docs/architecture.md) |
| Choose coverage, edit tests, or review tests                                                          | [Testing](docs/agents/testing.md)                                                                          |
| Validate changes, edit TypeScript or tooling, configure packages, update dependencies, or use Pi APIs | [Development](docs/development.md)                                                                         |
| Install the workspace or resolve prerequisites                                                        | [Setup](README.md#setup)                                                                                   |
