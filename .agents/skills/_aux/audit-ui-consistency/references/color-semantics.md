# Colour semantics

[Return to the UI consistency audit](../SKILL.md).

Map each surface's semantic roles, theme tokens, emphasis, and state overrides. Compare project conventions rather than imposing a universal palette.

## Checks

- Compare roles across relevant normal, selected, pending, completed, failed, cancelled, unavailable, collapsed, and expanded states.
- Distinguish raw ANSI output from generated status and diagnostics.
- Compare semantic roles in applicable light and dark forms, both selected and unselected.
- Apply [text and accessibility checks](text-and-accessibility.md#checks) for contrast, dimming with strikethrough, and non-colour state cues.

### Semantic roles

| Role                             | Criteria                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Primary content                  | Keep subjects, prompts, targets, and results readable and prominent.                                           |
| Heading and accent               | Distinguish headings, verbs, identifiers, and links.                                                           |
| Selection and focus              | Keep selection and focus apparent while retaining failure, completion, or disabled state.                      |
| Supporting information           | Use `muted`/`dim` consistently; retain readable outcome and recovery information.                              |
| Success                          | Allow different colours for distinct roles, such as neutral cards and completed tasks.                         |
| Progress and availability        | Define queued, running, pending, unavailable, and inactive roles; unstarted tasks are not inherently warnings. |
| Warning, error, and cancellation | Reflect consequences; preserve cancellation severity across grouping and expansion.                            |

## Evidence

Record role tables and source tokens alongside paired renders or screenshots when available. Check appearance in applicable themes. Headless assertions verify tokens, not contrast or terminal colours; a semantic token alone cannot establish a verified colour such as red.
