# [pi-skills](README.md) development

Use only Pi's public extension and autocomplete APIs.

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), at transform rank `100`. A separate `input` handler would run in load order. At this rank, input observers, such as pi-prompt-manager's prompt history, see the text before expansion, and transforms with a higher rank see the expanded text.
- Use Pi's currently registered paths exactly as given.
- Derive suggestions from the existing provider, so Pi's `enableSkillCommands` setting controls availability.
- Compose with existing providers. Recognise this extension's completion items by object identity, not by their text.
- Leave file discovery, content loading, fuzzy matching, and the editor to Pi. Add no runtime monkey-patches or persistent registration flags.

## Validation

| When you change…               | Read                                                |
| ------------------------------ | --------------------------------------------------- |
| Completion, formats, or wiring | [terminal checks](docs/testing.md#manual-checks)    |
| Supported Pi versions          | [compatibility checklist](docs/pi-compatibility.md) |

Keep the real-editor test for **Enter** acceptance; provider-only checks cannot prove that interaction.
