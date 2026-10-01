# [pi-skills](README.md) development

Use only Pi's public extension and autocomplete APIs.

## Constraints

- Use Pi's currently registered paths exactly as given.
- Derive suggestions from the existing provider, so Pi's `enableSkillCommands` setting controls availability.
- Compose with existing providers. Recognise this extension's completion items by object identity, not by their text.
- Don't add file discovery, content loading, a fuzzy matcher, a replacement editor, runtime monkey-patches, or persistent registration flags.

## Validation

| When you change…               | Run                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Behaviour or settings          | [Package checks](README.md#validation).                                                                                           |
| Completion, formats, or wiring | The [terminal checks](docs/testing.md#terminal-checks), keeping real-editor coverage of **Tab** routing and **Enter** acceptance. |
| Supported Pi versions          | The [compatibility checklist](docs/pi-compatibility.md).                                                                          |

Keep the real-editor tests for **Tab** routing and **Enter** acceptance; provider-only checks cannot prove those interactions.
