# [pi-read](README.md) development

Keep Pi's content blocks and details unchanged when adding selection previews.

## Must not regress

- Leave file access and images to Pi, and never reread the file.

## Constraints

- Keep truncation and continuation notices out of the selected source.
- Validate coordinates and slice raw source in the [selection module](src/selection.ts), following the [coordinate rules](README.md#coordinates).
- Keep source coordinates independent of terminal width. Sanitise only display text.
- Keep preview provenance and native source-window interpretation in the pure [`pi-read/result` contract](docs/result.md), shared with the display adapter.

## Validation

[Package validation](README.md#validation) routes tests, appearance checks, and Pi upgrades.
