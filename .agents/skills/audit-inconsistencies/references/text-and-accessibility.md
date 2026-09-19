# Text and accessibility

[Consistency audit](../SKILL.md)

Compare how surfaces display and handle long, multiline, Unicode, or unsafe text. Distinguish displayed text from exact source.

## Checks

- Do long subjects, multiline descriptions, paths, wide characters, combining marks, and other Unicode content wrap or truncate without misleading changes?
- Are terminal controls handled consistently without altering copied, restored, or persisted source unintentionally?
- Do previews explain relevant differences between displayed content and what an action will use? Restoration may refuse unsafe source.
- Are important status, selection, errors, and disabled states recognizable through text or glyphs rather than color alone?
- Is contrast adequate across applicable themes and selected states? Check dimming combined with strikethrough or other emphasis.
- Do constrained layouts preserve readable content and essential controls, or clearly explain the minimum usable size?

## Evidence

Use synthetic text with known byte and character content, not private prompts. Compare display output with the source passed to copy or restoration ports without replacing the real clipboard. Check appearance in applicable themes. Token assertions alone do not establish contrast or terminal rendering.
