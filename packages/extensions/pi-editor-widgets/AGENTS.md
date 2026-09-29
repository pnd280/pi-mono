# [pi-editor-widgets](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): TUI lifecycle, preferences, and `/widgets` mounting.
- [src/host.ts](src/host.ts): capability-checked installed-host discovery.
- [src/coordinator.ts](src/coordinator.ts): borrowed registries, region adapters, and footer ownership.
- [src/render.ts](src/render.ts): row layout and mouse geometry.
- [src/builtins.ts](src/builtins.ts): native session metrics and footer data.
- [src/layout.ts](src/layout.ts), [src/settings.ts](src/settings.ts): layout validation/defaults and trusted whole-layout persistence.
- [src/drafts.ts](src/drafts.ts), [src/menu.ts](src/menu.ts), [src/menu-view.ts](src/menu-view.ts): scoped drafts, actions, and menu presentation.
- [Shared interactive host fixture](../../libs/src/validation/interactive-host/README.md): installed Pi host with isolated settings and an offline terminal. Widget command and integration scenarios stay in this package.

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

Use [package validation](README.md#validation). Extend [behavioral coverage](docs/testing.md) for affected contracts. Reverify the [private host boundary](docs/pi-compatibility.md) on Pi upgrades; simulated registries alone cannot establish compatibility.
