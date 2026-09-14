## Working agreement

- Make clean breaks when changing APIs, configuration, or behavior. Do not retain compatibility layers, deprecated aliases, legacy code paths, or transitional support unless explicitly requested.
- Update all affected workspace consumers, tests, and documentation in the same change, and remove superseded implementations.
- Create all worktrees under `.worktrees`.
- Follow the [documentation conventions](docs/development.md#documentation).
- After changes, follow the [verification workflow](docs/agents/verification.md) before handoff.

## Task references

- **Reuse**: behavior changes or refactors: [ownership guidance](docs/agents/architecture.md) and [workspace architecture](docs/architecture.md).
- **Tests**: coverage decisions or test edits/reviews: [testing](docs/agents/testing.md).
- **Development**: validation, TypeScript/tooling edits, package setup, dependencies, or pi API work: [development](docs/development.md).
- **Commits**: composing a commit message: [commit-messages skill](.agents/skills/commit-messages/SKILL.md).
- **Setup**: installing the workspace or resolving prerequisites: [README.md](README.md).
