# Workspace development

Treat every change as greenfield: make breaking changes directly, and delete what they supersede, including legacy support, fallbacks, and their notices and scripts. Keep compatibility only when the user explicitly asks for it.

## Working agreement

- Update affected consumers, tests, and docs in the same change.
- Before you change code or tests, read the [testing policy](docs/agents/testing.md); it decides which tests to run, add, or remove.
- Before you report a change as done, complete the [verification workflow](docs/agents/verification.md).
- Keep temporary artifacts in `.tmp/`, except [mutable filesystem fixtures](docs/agents/testing.md#filesystem-fixtures), which use the system temporary directory.

## Task references

| When you…                                                                                                          | Read                                                           |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Look for the package that owns a feature                                                                           | [Workspace architecture](docs/architecture.md)                 |
| Implement or refactor behaviour, or share it between packages                                                      | [Code organisation and reuse](docs/agents/architecture.md)     |
| Run checks, edit TypeScript or tooling, configure packages, or update dependencies                                 | [Development](docs/development.md)                             |
| Change Pi behaviour or use Pi APIs: patch Pi, gate a host hook, name a custom entry or message, or notify the user | [Pi API contracts](docs/agents/pi-apis.md)                     |
| Validate configuration, persisted JSON, external data, or tool parameters                                          | [Runtime validation](docs/agents/runtime-validation.md)        |
| Write or edit docs, including `AGENTS.md`                                                                          | [Documentation conventions](docs/development.md#documentation) |
| Install the workspace or resolve prerequisites                                                                     | [Setup](README.md#setup)                                       |
