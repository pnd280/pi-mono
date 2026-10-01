# [pi-editor-widgets](README.md) development

Read the [compatibility boundary](docs/pi-compatibility.md) before changing host hooks.

## Must not regress

- Settings are the only persistence.
- Never write from registration, rendering, previewing, or non-TUI execution.
- Keep project trust checks at the settings boundary.
- Replacing a layout scope must never turn into merging rows or regions.
- Pi's native maps own creation, replacement, and disposal.
- Hidden or unavailable output must never lose its saved identity or placement.
- Reject competing footer ownership.
- Release only hooks and components the extension still owns.

## Constraints

- Keep contributors on Pi's native APIs: no registration adapter, copies of native components, ownership metadata, or Pi core changes.
- Render each placement once, at terminal width.
- Don't shrink widgets or probe other widths.
- Preview drafts only through live regions (`showDraft`), never through extra renders or copies in the menu.
- Pi's stable UI reference is a forwarding proxy. Hook the real renderer and rebind on mode changes, rather than patching properties on the proxy.
- Keep the menu out of overlays.
- Keep the selected action's identity across registration updates.
- On small screens show controls and inline recovery first.

## Validation

Use [package validation](README.md#validation) and the [behavioural coverage](docs/testing.md). Pi upgrades need the [private host checklist](docs/pi-compatibility.md) and installed-host fixtures, not simulated registries alone.
