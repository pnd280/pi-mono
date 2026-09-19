# Controls

[Consistency audit](../SKILL.md)

Compare advertised actions with input dispatch across browsers, details, previews, widgets, and related settings menus.

## Checks

- Do hints show usable bindings after remapping, conflicts, and input precedence are resolved?
- Are key labels, unavailable-action wording, and fixed versus configurable controls presented consistently?
- Do navigation and paging keys act on the expected list, preview, or transcript in each supported mode?
- Does cancellation close the current layer, return to the parent, or cancel work as advertised?
- Are keyboard focus, selection, and mouse routing consistent with the visible surface?
- Do controls remain accurate while loading, deleting, copying, or otherwise busy? Include key repeat and release when they affect confirmation.

## Evidence

Exercise both displayed hints and dispatch using the same bindings. Include a relevant conflict or remapping, nested-view return, and unavailable action. Headless component input does not establish which keys the host or terminal intercepts. Verify key routing in a real terminal or mark it unresolved.
