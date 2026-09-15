# Workspace development

## Working agreement

- Make clean breaks when changing APIs, configuration, or behavior. Do not retain compatibility layers, deprecated aliases, legacy code paths, or transitional support unless explicitly requested.
- Update all affected workspace consumers, tests, and documentation in the same change, and remove superseded implementations.
- Create all worktrees under `.worktrees`.
- Follow the [documentation conventions](docs/development.md#documentation).
- After changes, follow the [verification workflow](docs/agents/verification.md) before handoff.

## Task references

| Task                                                                                                  | Guidance                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Change behavior or refactor                                                                           | [Code organization and reuse](docs/agents/architecture.md), [workspace architecture](docs/architecture.md) |
| Choose coverage, edit tests, or review tests                                                          | [Testing](docs/agents/testing.md)                                                                          |
| Validate changes, edit TypeScript or tooling, configure packages, update dependencies, or use Pi APIs | [Development](docs/development.md)                                                                         |
| Compose a commit message                                                                              | [Commit messages](.agents/skills/commit-messages/SKILL.md)                                                 |
| Install the workspace or resolve prerequisites                                                        | [Setup](README.md#setup)                                                                                   |
