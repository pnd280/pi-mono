# Text and accessibility

[Return to the UI consistency audit](../SKILL.md).

Compare long, multiline, Unicode, and unsafe text. Distinguish display from exact source.

## Checks

- Preserve meaning when wrapping or truncating subjects, descriptions, paths, wide characters, and combining marks.
- Handle control characters consistently while preserving copy, restore, and storage contracts.
- Explain differences between previewed content and action results, including unsafe-restore refusal.
- Keep status, selection, errors, and disabled states identifiable through text or glyphs as well as color.
- Check contrast across applicable themes and selected/unselected states, including dimming combined with strikethrough.
- Preserve readability and controls in constrained views, or explain the minimum supported size.

## Evidence

Use known synthetic bytes and characters to compare display with copied/restored source in disposable fixtures. Verify appearance in applicable terminal themes; token assertions alone cannot establish contrast or terminal appearance.
