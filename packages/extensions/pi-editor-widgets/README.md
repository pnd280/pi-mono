# pi-editor-widgets

Arrange native widgets, individual statuses, and built-in footer information above the editor, below it, or in the footer. Contributors continue using Pi's ordinary `setWidget()` and `setStatus()` APIs. Interactive TUI only, in regular and fullscreen modes.

## Usage

Open `/widgets` to edit a layout. The non-overlay menu starts in project scope if an override exists, otherwise global; Tab switches scopes, and project scope requires trust. Choose a region, row, then contents. The regions preview the selected draft until you close the menu; unsaved changes are discarded.

`*` marks an edited draft; `(not set)` indicates an unset saved scope. An unset project draft inherits the **saved** global layout, not unsaved global edits.

| Control               | Action                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| Up / Down             | Select an item, stopping at boundaries                                   |
| Enter                 | Open a view or activate the selected action                              |
| Shift+Up / Shift+Down | Reorder a row or row item, stopping at boundaries                        |
| Delete                | Remove a row or item; hide widgets only after their last copy is removed |
| Tab / Shift+Tab       | Switch between independent global and trusted-project drafts             |
| a                     | Add a row in the row list; open the item picker inside a row             |
| Ctrl+S                | Save displayed draft; use the effective saved layout on close            |
| Escape                | Return to the parent; at the root, discard unsaved edits                 |
| Ctrl+C                | Close from any view and discard remaining unsaved edits                  |

These are fixed menu keys, independent of Pi's configurable browser bindings. Native transcript paging remains with Pi. On small terminals, resize for the full view.

Press **a** in a region's row list to create a row, even when empty. In a row, **a** opens the item picker. A widget, status, or built-in can appear in multiple rows or regions, but only once per row. Delete removes one placement; the last removal hides the contributor. To move one, add it at the destination and delete it at the source. Unavailable saved IDs remain identifiable.

Only Ctrl+S persists changes. A global draft previews even if a project override exists; the project layout applies again on close. Saving an unchanged unset scope creates an explicit layout. **Reset to defaults** stages the default layout; Ctrl+S saves it.

A failed save leaves the draft open with an inline error; Ctrl+S retries. Load warnings also appear inline.

By default, native above/below widgets each occupy their own row. The footer contains:

```text
cwd • git branch • session title
tokens • used/window (percent) (auto)          provider/model:thinking
extension status • extension status …
```

Any contribution can move to any region, share rows, and appear in several rows. Above-editor content reserves a blank line from chat. Empty widgets collapse without losing their positions.

Rows wrap whole contributions rather than shrinking them; `flex` right-aligns the following group. Vertical clipping protects the editor and indicates omitted content.

## Configuration

Use the literal `ext.pi-editor-widgets` key in `getAgentDir()/settings.json` (normally `~/.pi/agent/settings.json`, respecting `PI_CODING_AGENT_DIR`) or the current directory's trusted `.pi/settings.json`. No ancestor search. Preferences load on session start/reload and refresh when `/widgets` opens; no save is needed.

```json
{
  "ext.pi-editor-widgets": {
    "layout": {
      "aboveEditor": [],
      "belowEditor": [],
      "footer": [
        ["builtin:cwd", "separator", "builtin:git-branch"],
        ["builtin:tokens", "separator", "builtin:context", "flex", "builtin:model"]
      ],
      "hidden": ["builtin:session-title"]
    },
    "contextThreshold": 150000
  }
}
```

A project layout replaces the **entire** global layout; otherwise global settings or extension defaults apply. Empty regions do not hide unlisted or future registrations. New native widgets use their requested region; new statuses join a trailing footer row. Intentional suppression requires a hidden ID.

IDs are `widget:<native-key>`, `status:<native-key>`, and the six built-ins shown above. An ID may appear in several rows, at most once per row; hidden IDs must be unique and must not also be placed. Each row allows at most one `flex`. Unknown IDs are retained. Invalid layouts warn and fall back as a unit. Settings use the workspace's 1 MiB file limit; there are no per-widget size, priority, style, or overflow options.

### Context usage

The context built-in shows used tokens, window size, and percentage. Unknown usage (for example after compaction) displays `?` for used tokens and omits the percentage; `(auto)` means automatic compaction is enabled.

Without `contextThreshold`, the color is dim up to 70% of the window, warning above 70%, and error above 90%. Set `contextThreshold` to a positive integer token count to use these bands instead:

| Used tokens                            | Theme color |
| -------------------------------------- | ----------- |
| Below one third of the threshold       | `dim`       |
| From one third to below two thirds     | `success`   |
| From two thirds to below the threshold | `warning`   |
| At or above the threshold              | `error`     |

The threshold resolves independently of the layout: a trusted project value overrides the global one. An invalid value warns and falls back to the next scope, then to percentage-based colors if neither scope provides a valid threshold. `/widgets` saves preserve this setting; edit it only in `settings.json`.

## Side effects

This extension owns the entire footer while active. A competing `setFooter()` owner produces a conflict diagnostic; resolve it and `/reload`. Arbitrary custom footers are not merged. Native widgets and statuses remain supported without contributor changes.

Moving, duplicating, or hiding contributions does not create or dispose registered components; copies share the same instance and its side effects. Mouse drag capture has [geometry limitations](docs/pi-compatibility.md#limitations-and-replacement-opportunities).

Only Ctrl+S writes settings, using [locked atomic updates](../../libs/src/settings-file/README.md#behavior) that preserve unrelated fields and settings symlinks. Unreadable or malformed files/sections are not overwritten; an explicit save can replace an invalid layout inside a valid section while preserving other fields. No added network requests, polling services, or transcript entries. Hidden contributors retain their own side effects.

## Validation

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. See [coverage and terminal checks](docs/testing.md) and the [Pi compatibility checklist](docs/pi-compatibility.md).

The installed-host fixtures verify Pi 0.87.1's registration, renderer, reload, and footer contracts. Terminal interaction requires separate validation.
