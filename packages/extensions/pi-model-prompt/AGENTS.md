# [pi-model-prompt](README.md) development

Change prompts only through `systemPromptOptions`, never by forcing `systemPrompt`.

## Constraints

- Only add to `appendSystemPrompt`, through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `100`. Keep the text that Pi, `--append-system-prompt`, and earlier extensions put there.
- Read `ctx.model` inside the part, not earlier. The coordinator calls parts after holds such as a profile switch.
- Read files and settings only on session start.
- Keep settings global.
- New per-model fields must be selectable independently.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
