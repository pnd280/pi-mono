# Controls

[User interface consistency audit](../SKILL.md)

Compare advertised actions with dispatch across browsers, details, previews, widgets, and settings.

## Checks

- Do hints reflect remapping, conflicts, and precedence?
- Are key labels, unavailable actions, and fixed/configurable controls consistent?
- Do navigation/paging target the expected list, preview, or transcript in each mode?
- Does cancel close, return, or stop work as advertised?
- Do focus, selection, and mouse routing match the visible surface?
- Are controls accurate while loading, deleting, copying, or busy, including confirmation repeat/release behavior?

## Evidence

Exercise hints and dispatch with identical bindings, including conflicts/remaps, nested return, and unavailable actions. Headless input cannot establish host/terminal interception; verify real-terminal routing or mark unresolved.
