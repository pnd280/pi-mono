# [pi-abort-guard](README.md) development

## Constraints

- Pass the second interrupt press to the wrapped editor's `handleInput`, never to an abort API directly. Pi's escape handler chooses between stopping the run, a retry, a compaction, and a branch summary.
- Wrap the editor that Pi or an earlier extension set, and change only its `handleInput` and `embedWorkingStatus`, so that other extensions' changes to the same editor stay in either load order.

## Validation

For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
