# [pi-abort-guard](README.md) development

Pass the second interrupt press to the wrapped editor's `handleInput`, never to an abort API directly: Pi's escape handler chooses between stopping the run, a retry, a compaction, and a branch summary.

Pass idle presses, autocomplete presses, and all other keys to the wrapped editor unchanged.

Wrap the editor that Pi or an earlier extension set, and change only its `handleInput` and `embedWorkingStatus`, so that other extensions' changes to the same editor stay in either load order.

Preserve the documented [input behaviour](README.md#behaviour) and [editor-ownership limits](README.md#limitations).

## Validation

[Testing](docs/testing.md) lists the automated coverage and manual checks. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
