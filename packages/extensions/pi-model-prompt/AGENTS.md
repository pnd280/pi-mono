# [pi-model-prompt](README.md) development

## Constraints

- Change prompts only by appending to `systemPromptOptions.appendSystemPrompt`, through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `100`. Keep the text that Pi, `--append-system-prompt`, and earlier extensions put there, and never force `systemPrompt`.
- Keep settings global.

## Validation

For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
