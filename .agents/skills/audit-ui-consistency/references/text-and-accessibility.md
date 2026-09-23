# Text and accessibility

[User interface consistency audit](../SKILL.md)

Compare long, multiline, Unicode, and unsafe text; distinguish display from exact source.

## Checks

- Do subjects, descriptions, paths, wide characters, and combining marks wrap/truncate without misleading changes?
- Are controls handled consistently without unintended copy/restore/storage changes?
- Do previews explain display/action differences, including unsafe-restore refusal?
- Are status, selection, errors, and disabled states identifiable without color?
- Is contrast sufficient across themes/selection, including dimming with strikethrough?
- Do constrained views preserve readability/controls or explain minimum size?

## Evidence

Use known synthetic bytes/characters, never private prompts. Compare display with copied/restored source without replacing live clipboards. Check applicable themes; token assertions cannot establish contrast or terminal appearance.
