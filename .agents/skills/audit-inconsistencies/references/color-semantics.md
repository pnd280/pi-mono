# Color semantics

[Consistency audit](../SKILL.md)

For each relevant surface, record semantic roles, theme tokens, emphasis, and state-dependent overrides in a table. Compare them with the project's design conventions rather than imposing a universal palette.

## Semantic roles

| Role                             | Audit criteria                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary content                  | Subjects, prompt text, file targets, and result content remain readable and prominent.                                                                            |
| Heading and accent               | Headings, action verbs, identifiers, and links have distinguishable roles. Accent use preserves those distinctions.                                               |
| Selection and focus              | Selection is identifiable independently of status. Selection styling does not erase failure, completion, or disabled state. Keyboard focus remains apparent.      |
| Supporting information           | `muted` and `dim` have consistent roles. Essential outcome and recovery information remains readable.                                                             |
| Success                          | A neutral successful tool card and a completed-task marker need not share a color when their roles differ.                                                        |
| Progress and availability        | Queued, running, pending, unavailable, and inactive states have explicit meanings. An unstarted task is not inherently a warning.                                 |
| Warning, error, and cancellation | Attention and failure colors reflect consequences. Cancellation has an explicit policy and does not change severity merely because a card is grouped or expanded. |

## Checks

- Compare the same role across normal, selected, pending, completed, failed, cancelled, unavailable, collapsed, and expanded states as relevant.
- Distinguish raw output's own ANSI styling from extension-generated status and diagnostics.
- Include light and dark themes when available, plus selected and unselected forms.
- Check whether dimming combined with strikethrough makes completed content unnecessarily difficult to read.
- Ensure glyphs or text communicate important state without color alone.

## Evidence

Check token use in source and rendered appearance in applicable themes. Include the role table and paired renders or screenshots where available. Headless token assertions establish token selection, not actual contrast or terminal appearance. Do not report a color name such as red as verified from a semantic token alone.
