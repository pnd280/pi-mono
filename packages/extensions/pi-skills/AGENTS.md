# [pi-skills](README.md) development

## Code navigation

- **Host integration:** [src/index.ts](src/index.ts) registers input expansion and TUI completion.
- **Policy and completion:** [src/tokens.ts](src/tokens.ts), [src/skills.ts](src/skills.ts), [src/config.ts](src/config.ts), and [src/autocomplete.ts](src/autocomplete.ts).
- **Host fixtures:** [src/editor.test.ts](src/editor.test.ts), [src/index.test.ts](src/index.test.ts), and [validation/](validation/).

## Constraints

Use Pi's public extension and autocomplete APIs.

Use Pi's current registered paths verbatim. Derive suggestions from the existing provider so Pi's `enableSkillCommands` setting controls availability. Do not add file discovery, content loading, a fuzzy matcher, editor replacement, runtime monkey-patches, or persistent registration flags.

Compose with existing providers. Identify this extension's completion items by object identity, not candidate text.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package checks](README.md#validation) and [terminal checks](docs/testing.md#terminal-checks). Retain real-editor coverage for Tab routing and Enter acceptance; provider-only checks cannot establish these interactions.
