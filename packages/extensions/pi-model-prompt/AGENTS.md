# [pi-model-prompt](README.md) development

## Constraints

Change prompts only through `systemPromptOptions`, never a forced `systemPrompt`. Mirror Pi's `APPEND_SYSTEM.md` discovery and byte-order-mark handling so the replacement guard compares equal text. Read files and settings only on session start. Keep settings global and new per-model fields independently selectable.

## Validation

For Pi upgrades follow [compatibility](docs/pi-compatibility.md). Run [package validation](README.md#validation) offline; [testing](docs/testing.md) defines the coverage boundary.
