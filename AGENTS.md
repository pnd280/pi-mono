# Workspace development

Treat every change request as building from the ground up by default. Make breaking changes directly; do not add or retain legacy support, fallbacks, or related notices or scripts unless explicitly requested.

## Working agreement

- Update affected consumers, tests, and docs; remove superseded implementations.
- Keep temporary artifacts in `.tmp/`, except [mutable filesystem fixtures](docs/agents/testing.md#filesystem-fixtures), which use the system temporary directory.
- Follow [documentation conventions](docs/development.md#documentation) and the [verification workflow](docs/agents/verification.md).

## Task references

| Task                                                                                                               | Guidance                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Find the package that owns a feature                                                                               | [Workspace architecture](docs/architecture.md)             |
| Change behaviour or refactor                                                                                       | [Code organisation and reuse](docs/agents/architecture.md) |
| Choose coverage, edit tests, or review tests                                                                       | [Testing](docs/agents/testing.md)                          |
| Run checks, edit TypeScript or tooling, configure packages, or update dependencies                                 | [Development](docs/development.md)                         |
| Change Pi behaviour or use Pi APIs, patch Pi, gate a host hook, name a custom entry or message, or notify the user | [Pi API contracts](docs/agents/pi-apis.md)                 |
| Validate configuration, persisted JSON, external data, or tool parameters                                          | [Runtime validation](docs/agents/runtime-validation.md)    |
| Install the workspace or resolve prerequisites                                                                     | [Setup](README.md#setup)                                   |
