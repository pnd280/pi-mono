# Model-prompt test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests trust of prompt sources, protection of other append text, and safe warnings. Pi owns transcript recording, prompt caching, and project-trust resolution.

## Must not regress

- **Critical, e2e:** Project settings do not supply or override model-prompt rules, even in trusted projects.
- **Critical, e2e:** An untrusted project's `APPEND_SYSTEM.md` is excluded from base discovery. Globally configured files may still be read from that project.
- **High, e2e:** The extension leaves `systemPromptOptions.appendSystemPrompt` unchanged when it differs from the loaded base text, including text from `--append-system-prompt` or an earlier extension. Explicit append text identical to the loaded base stays eligible for replacement, because its source cannot be distinguished.
- **High, e2e:** The selected model uses its first matching append rule. Model switches do not retain previous-model instructions, and reload refreshes the configured snapshot.
- **High, integration:** A failed selected file or unreadable base leaves append text unchanged, without partial application or later-rule fallthrough.
- **High, unit:** Settings-validation warnings do not echo supplied keys or values.
- **Critical, e2e:** File warnings sent to `ctx.ui.notify` identify the affected path as plain text with terminal control sequences removed.

## Not tested

- Configuration and file-size limit cases are below the severity bar.
- Warning visibility in modes without a UI is below the severity bar.
