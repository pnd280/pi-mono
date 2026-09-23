# [pi-skills](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): input hook and TUI autocomplete registration.
- [src/skills.ts](src/skills.ts): registered paths and command-name collisions.
- [src/config.ts](src/config.ts): global and trusted-project JSON settings for expansion format.
- [src/tokens.ts](src/tokens.ts): configurable exact token expansion and token bounds at the cursor.
- [src/autocomplete.ts](src/autocomplete.ts): inline suggestions and completion insertion.
- [src/editor.test.ts](src/editor.test.ts): real-editor interactions. [src/index.test.ts](src/index.test.ts): offline host input and lifecycle integration.
- [validation/](validation/): terminal fixtures and input capture, using [shared offline launch preparation](../../libs/src/validation/pi-process/README.md).

## Constraints

Use Pi 0.87.1's public extension and autocomplete APIs, following [workspace code organization](../../../docs/agents/architecture.md).

Use Pi's current registered paths verbatim. Derive suggestions from the existing provider so Pi's `enableSkillCommands` setting controls availability. Do not add file discovery, content loading, a fuzzy matcher, editor replacement, runtime monkey-patches, or persistent registration flags.

Compose with existing providers. Identify this extension's completion items by object identity, not candidate text.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use the [package checks and terminal procedure](README.md#validation) and shared [verification](../../../docs/agents/verification.md) and [testing](../../../docs/agents/testing.md) guidance. Retain real-editor coverage for Tab routing and Enter acceptance; provider-only checks cannot establish these interactions.
