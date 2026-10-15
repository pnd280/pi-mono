# [pi-abort-guard](README.md) development

Hold back the first interrupt press in the editor only. Pass the second press to `CustomEditor.handleInput`, never to an abort API directly: Pi's escape handler chooses between stopping the run, a retry, a compaction, and a branch summary.

## Must not regress

- A second press within the window always reaches Pi's escape handler.
- Idle presses, autocomplete presses, and all other keys reach the base editor unchanged.
- Never replace an editor that another extension installed.

## Validation

Use the [focused checks](../../../docs/development.md#focused-validation). [Testing](docs/testing.md) lists what is tested. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
