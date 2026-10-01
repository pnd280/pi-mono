# [pi-read](README.md) development

Keep Pi's content blocks and details unchanged when adding selection previews.

## Must not regress

- Leave file access and images to Pi, and never reread the file.

## Constraints

- Keep truncation and continuation notices out of the selected source.
- Use the shared [source-selection helpers](../../utils/README.md#source-selections) to validate coordinates and slice source.
- Keep source coordinates independent of terminal width. Sanitise only display text.
- Keep preview provenance and native source-window interpretation in the pure [`pi-read/result` contract](docs/result.md), shared with the display adapter.

## Validation

Use [package validation](README.md#validation) and [testing](docs/testing.md). For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md).
