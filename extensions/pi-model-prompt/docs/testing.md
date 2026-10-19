# Model-prompt test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests global-only settings, preservation of other append text, and safe warnings. Pi owns `APPEND_SYSTEM.md` discovery, transcript recording, prompt caching, and project-trust resolution.

## Must not regress

- **Critical, e2e:** Project settings do not supply or override model-prompt rules, even in trusted projects.
- **High, e2e:** The extension keeps the existing `systemPromptOptions.appendSystemPrompt` text, including text from `APPEND_SYSTEM.md`, `--append-system-prompt`, or an earlier extension, and adds the selected files after it. It does not add `APPEND_SYSTEM.md` text that Pi didn't load.
- **High, e2e:** The selected model uses its first matching append rule. Model switches do not retain previous-model instructions, and reload refreshes the configured snapshot.
- **High, integration:** A failed selected file leaves append text unchanged, without partial application or later-rule fallthrough.
- **High, integration:** Settings-validation warnings do not echo supplied keys or values.
- **Critical, e2e:** File warnings sent to `ctx.ui.notify` identify the affected path as plain text with terminal control sequences removed.

## Not tested

- Configuration and file-size limit cases are below the severity bar.
- Warning visibility in modes without a UI is below the severity bar.
