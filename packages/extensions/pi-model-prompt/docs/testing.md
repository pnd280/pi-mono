# Model-prompt test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests trust of prompt sources, protection of other append text, and safe warnings. Pi owns transcript recording, prompt caching, and project-trust resolution.

## Must not regress

- **Critical, integration:** Project settings do not supply or override model-prompt rules, even in trusted projects.
- **Critical, e2e:** An untrusted project's `APPEND_SYSTEM.md` is excluded from base discovery. Globally configured files may still be read from that project.
- **High, e2e:** The extension leaves `systemPromptOptions.appendSystemPrompt` unchanged when it differs from the loaded base text, including text from `--append-system-prompt` or an earlier extension. Explicit append text identical to the loaded base stays eligible for replacement, because its source cannot be distinguished.
- **High, unit:** Settings-validation warnings do not echo supplied keys or values.
- **Critical, unit:** File warnings sent to `ctx.ui.notify` identify the affected path as plain text with terminal control sequences removed.

## Not tested

- Rule matching, path resolution, limits, file joining, warning order, and caching until `/reload`: below the severity bar.
