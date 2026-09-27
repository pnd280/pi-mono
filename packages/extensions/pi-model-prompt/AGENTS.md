# [pi-model-prompt](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): session-start loading, warnings, and the `before_agent_start` adapter.
- [src/config.ts](src/config.ts): global settings schema, regex rules, and per-field first-match selection.
- [src/append-files.ts](src/append-files.ts): base discovery mirroring Pi, scope-first variant precedence, and the replacement guard.
- [src/index.test.ts](src/index.test.ts): offline host integration for model switches, CLI append text, and `/reload`.

## Constraints

Change prompts only through `systemPromptOptions`; never return a forced `systemPrompt`. Mirror Pi's `APPEND_SYSTEM.md` discovery and byte-order-mark handling so the replacement guard compares equal text. Read files and settings only on session start, not per run. Keep settings global. Keep the `rules` layout extensible: new per-model fields resolve independently.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation) and shared [verification](../../../docs/agents/verification.md) and [testing](../../../docs/agents/testing.md) guidance. Do not make paid model requests for validation.
