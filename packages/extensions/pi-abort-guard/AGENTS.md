# [pi-abort-guard](README.md) development

Pass the second interrupt press to `CustomEditor.handleInput`, never to an abort API directly: Pi's escape handler chooses between stopping the run, a retry, a compaction, and a branch summary.

Pass idle presses, autocomplete presses, and all other keys to the base editor unchanged.

Preserve the documented [input behaviour](README.md#behaviour) and [editor-ownership limits](README.md#limitations).

## Validation

[Testing](docs/testing.md) lists the automated coverage and manual checks. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
