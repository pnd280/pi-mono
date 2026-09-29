# [pi-editor-widgets](README.md) development

Read the [compatibility boundary](docs/pi-compatibility.md) before changing host hooks.

## Constraints

- Keep contributors on Pi's native APIs: no registration adapter, native component copies, ownership metadata, or Pi core changes.
- Native maps own creation, replacement and disposal. Hidden/unavailable output must not lose saved identity or placement.
- Render each placement once at terminal width; do not shrink widgets or probe alternate widths. Preview drafts only through live regions (`showDraft`), not extra renders/copies in the menu.
- Pi's stable UI reference is a forwarding proxy. Hook the actual renderer and rebind on mode changes, not properties on that proxy.
- Reject competing footer ownership and release only still-owned hooks/components.
- Keep project trust checks at the settings boundary. Layout scope replacement must not become row/region merging.
- Settings are the only persistence. Never write from registration, rendering, previewing, or non-TUI execution.
- Keep the menu non-overlay; preserve selected action identity across registration updates and prioritize controls and inline recovery on small screens.

## Validation

Use [package validation](README.md#validation) and [behavioral coverage](docs/testing.md). Pi upgrades need the [private host checklist](docs/pi-compatibility.md) and installed-host fixtures, not simulated registries alone.
