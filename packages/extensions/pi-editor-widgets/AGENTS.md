# [pi-editor-widgets](README.md) development

Before you change host hooks, the renderer, or the footer, read the [compatibility boundary](docs/pi-compatibility.md).

## Must not regress

- Settings are the only persistence.
- Write settings only from an explicit save in `/widgets`. Never write from registration, rendering, previewing, or non-TUI execution.
- Keep project trust checks at the settings boundary.
- Replacing a layout scope must never turn into merging rows or regions.
- Pi's native maps own creation, replacement, and disposal.
- Hidden or unavailable output must never lose its saved identity or placement.
- Reject competing footer ownership.
- Release only hooks and components the extension still owns.

## Constraints

- Keep contributors on Pi's native APIs: no registration adapter, copies of native components, or ownership metadata.
- Render each placement once, at terminal width, without shrinking widgets or probing other widths.
- Preview drafts only through live regions (`showDraft`), never through extra renders or copies in the menu.
- Keep the menu out of overlays.
- Keep the selected action's identity across registration updates.
- On small screens show controls and inline recovery first.

## Validation

| When you…  | Read                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Run checks | [Terminal validation](docs/validation.md).                                                                                          |
| Upgrade Pi | The [private host checklist](docs/pi-compatibility.md). Run the installed-host fixtures as well as tests with simulated registries. |
