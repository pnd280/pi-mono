# [pi-model-prompt](README.md) development

Change prompts only through `systemPromptOptions`, never by forcing `systemPrompt`.

## Constraints

- Only add to `appendSystemPrompt`. Keep the text that Pi, `--append-system-prompt`, and earlier extensions put there.
- Read files and settings only on session start.
- Keep settings global.
- New per-model fields must be selectable independently.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
