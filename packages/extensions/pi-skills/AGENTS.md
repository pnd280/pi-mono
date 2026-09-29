# [pi-skills](README.md) development

## Constraints

Use Pi's public extension and autocomplete APIs.

Use Pi's current registered paths verbatim. Derive suggestions from the existing provider so Pi's `enableSkillCommands` setting controls availability. Do not add file discovery, content loading, a fuzzy matcher, editor replacement, runtime monkey-patches, or persistent registration flags.

Compose with existing providers. Identify this extension's completion items by object identity, not candidate text.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package checks](README.md#validation) and [terminal checks](docs/testing.md#terminal-checks). Retain real-editor coverage for Tab routing and Enter acceptance; provider-only checks cannot establish these interactions.
