# [pi-model-prompt](README.md) development

Change prompts only through `systemPromptOptions`, never by forcing `systemPrompt`.

## Constraints

- Mirror Pi's `APPEND_SYSTEM.md` discovery and byte-order-mark handling, so the replacement check compares the same text Pi loaded.
- Read files and settings only on session start.
- Keep settings global.
- New per-model fields must be selectable independently.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
