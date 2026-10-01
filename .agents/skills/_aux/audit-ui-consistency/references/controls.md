# Controls

[Return to the UI consistency audit](../SKILL.md).

Compare advertised actions with input dispatch across browsers, details, previews, widgets, and settings.

## Checks

- Match hints to actual remapping, conflicts, and precedence.
- Compare key labels, unavailable actions, and the distinction between fixed and configurable controls.
- Verify that navigation and paging target the expected list, preview, or transcript in each mode.
- Match cancel behaviour to its advertised effect: close, return, or stop work.
- Match focus, selection, and mouse routing to the visible surface.
- Check controls during loading, deletion, copying, and busy states, including confirmation repeat and release behaviour.

## Evidence

Exercise hints and dispatch with identical bindings, including conflicts, remaps, nested return, and unavailable actions. Headless input cannot establish host or terminal interception; verify real-terminal routing or leave it unresolved.
