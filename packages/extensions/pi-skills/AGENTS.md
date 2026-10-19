# [pi-skills](README.md) development

Use only Pi's public extension and autocomplete APIs.

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), at transform rank `100`. A separate `input` handler would run in load order.
- Input observers, such as pi-prompt-manager's prompt history, see the text before expansion. Transforms with a rank higher than `100` see the expanded text.
- Use Pi's currently registered paths exactly as given.
- Derive suggestions from the existing provider, so Pi's `enableSkillCommands` setting controls availability.
- Compose with existing providers. Recognise this extension's completion items by object identity, not by their text.
- Don't add file discovery, content loading, a fuzzy matcher, a replacement editor, runtime monkey-patches, or persistent registration flags.

## Validation

| When you change…               | Run                                                                    |
| ------------------------------ | ---------------------------------------------------------------------- |
| Behaviour or settings          | The [package checks](../../../docs/development.md#focused-validation). |
| Completion, formats, or wiring | The [terminal checks](docs/testing.md#manual-checks).                  |
| Supported Pi versions          | The [compatibility checklist](docs/pi-compatibility.md).               |

Keep the real-editor test for **Enter** acceptance; provider-only checks cannot prove that interaction.
