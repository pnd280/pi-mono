# pi-editor-widgets

Arrange native widgets, individual statuses, and built-in footer information above the editor, below it, or in the footer. Contributors continue using Pi's ordinary `setWidget()` and `setStatus()` APIs. Interactive TUI only, in regular and fullscreen modes.

## Usage

1. Open `/widgets`, then choose a region, row, and contents. Follow the menu's fixed key hints: **a** adds, **Shift+Up/Down** reorders, and **Delete** removes a placement. Removing the last copy hides that contributor.
2. Use **Tab** to switch global/project drafts; project scope requires trust. Edits preview live without saving.
3. Press **Ctrl+S** to save the displayed scope. **Escape** returns to the parent view; **Ctrl+C** closes and discards remaining unsaved edits. Failed saves retain the draft for retry.

Contributions can share rows or appear in multiple regions. Rows wrap whole contributions instead of shrinking them; empty widgets collapse without losing their positions.

In fullscreen, click the token/context widget or run `/widgets tokens` or `/widgets context` to toggle compact and detailed displays. Regular mode always shows full token details and context percentages. Fullscreen selections reset on session start or `/reload` and never write settings.

## Configuration

For manual layout JSON, scope inheritance, or context-color settings, read [settings and layouts](docs/settings.md). Preferences refresh on session start, `/reload`, and opening `/widgets`.

## Side effects

This extension owns the entire footer. Disable competing custom-footer extensions and `/reload` to resolve conflicts; native widgets and statuses remain supported.

Moving, duplicating, or hiding contributions does not create or dispose registered components; copies share the same instance and its side effects. Mouse drag capture has [geometry limitations](docs/pi-compatibility.md#limitations-and-replacement-opportunities).

Only Ctrl+S writes layout settings, preserving unrelated fields and settings symlinks. Unreadable or malformed files/sections require repair before saving.

## Validation

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. For interaction changes, use the [terminal checks](docs/testing.md#terminal-checks); for Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
