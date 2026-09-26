# [pi-editor-widgets](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): TUI lifecycle, preferences, and `/widgets` mounting.
- [src/host.ts](src/host.ts): capability-checked installed-host discovery.
- [src/coordinator.ts](src/coordinator.ts): borrowed registries, region adapters, renderer invalidation, clipping, and footer ownership.
- [src/render.ts](src/render.ts): bounded measurement, shared-row allocation, reflow, separator composition, and mouse geometry.
- [src/builtins.ts](src/builtins.ts): native session metrics and footer data.
- [src/layout.ts](src/layout.ts), [src/settings.ts](src/settings.ts): layout validation/defaults and trusted whole-layout persistence.
- [src/drafts.ts](src/drafts.ts), [src/menu.ts](src/menu.ts): independent scoped drafts, identity-preserving selection, nested actions, and save/recovery transitions.
- [src/menu-view.ts](src/menu-view.ts): widget labels, row summaries, and breadcrumbs. [src/menu.ts](src/menu.ts) supplies passive previews and state to the [shared settings frame](../../libs/src/tui/components/settings-menu/README.md).
- [Shared interactive host fixture](../../libs/src/validation/interactive-host/README.md): installed Pi host with isolated settings and an offline terminal. Widget command and integration scenarios stay in this package.

## Constraints

- Keep contributors on Pi's native APIs: no registration adapter, native component copies, ownership metadata, or Pi core changes.
- Native maps own creation, replacement and disposal. Hidden/unavailable output must not lose saved identity or placement.
- Use the same renderer for every region. Bound component measurement; never probe live native components for draft previews.
- Pi's stable UI reference is a forwarding proxy. Hook the actual renderer and rebind on mode changes, not properties on that proxy.
- Reject competing footer ownership and release only still-owned hooks/components.
- Keep project trust checks at the settings boundary. Layout scope replacement must not become row/region merging.
- Settings are the only persistence. Never write from registration, rendering, previewing, or non-TUI execution.
- Keep the menu non-overlay. Preserve selected action identity across registration updates and prioritize essential controls and inline recovery on constrained screens. Use `a` to add rows or open the item picker, and Ctrl+S for saving, without duplicate action rows or a details submenu.

## Validation

Use [package validation](README.md#validation). Extend [behavioral coverage](docs/testing.md) for affected contracts. Reverify the [private host boundary](docs/pi-compatibility.md) on Pi upgrades; simulated registries alone cannot establish compatibility.
