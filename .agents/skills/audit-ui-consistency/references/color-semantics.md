# Color semantics

[User interface consistency audit](../SKILL.md)

Table each surface's semantic roles, theme tokens, emphasis, and state overrides. Compare project conventions, not a universal palette.

## Checks

- Are roles consistent across relevant normal, selected, pending, completed, failed, cancelled, unavailable, collapsed, and expanded states?
- Is raw ANSI output distinct from generated status/diagnostics?
- Are roles consistent in applicable light/dark and selected/unselected forms?
- Does dimming plus strikethrough hinder reading completed content?
- Do text/glyphs convey important state without color?

### Semantic roles

| Role                             | Criteria                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Primary content                  | Subjects, prompts, targets, and results remain readable/prominent.                                       |
| Heading and accent               | Distinguish headings, verbs, identifiers, and links.                                                     |
| Selection and focus              | Keep selection/focus apparent without erasing failure, completion, or disabled state.                    |
| Supporting information           | Use `muted`/`dim` consistently; retain readable outcome/recovery information.                            |
| Success                          | Different roles, such as neutral cards and completed tasks, may use different colors.                    |
| Progress and availability        | Define queued, running, pending, unavailable, and inactive; unstarted tasks are not inherently warnings. |
| Warning, error, and cancellation | Reflect consequences; grouping/expansion must not change cancellation severity.                          |

## Evidence

Check source tokens and appearance in applicable themes. Include role tables and paired renders/screenshots when available. Headless assertions verify tokens, not contrast or terminal colors; never infer verified red, for example, from a semantic token alone.
