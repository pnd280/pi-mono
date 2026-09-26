# pi-editor-widgets

Arrange native widgets, individual statuses, and built-in footer information above the editor, below it, or in the footer. Contributors continue using Pi's ordinary `setWidget()` and `setStatus()` APIs. Interactive TUI only, in regular and fullscreen modes.

## Usage

Open `/widgets` with no arguments to edit a layout. The menu opens project scope when an override exists, otherwise global. Switch scopes inside the menu with Tab; project scope requires trust. The menu is non-overlay in regular and fullscreen modes. Choose a region, a row, then its contents. The actual regions show the selected scope's draft live while the menu is open, using the same widget instances; the menu shrinks to leave them visible and they clip on short terminals. Closing restores the saved layout.

The selected save scope uses the accent color. `*` marks an edited draft; `(not set)` refers to saved state and remains until a successful save, even after editing. An unset project draft inherits the saved global layout, never unsaved global edits. Global drafts never inherit project overrides.

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

These are fixed menu keys, independent of Pi's configurable browser bindings. Native transcript paging remains with Pi. The widget settings editor uses the [shared settings frame](../../libs/src/tui/components/settings-menu/README.md). At 40×10, selection, save/exit controls, and recovery take priority over paths, live regions, and secondary context; resize smaller terminals for the full view.

Press **a** in a region's row list to create a row and open it for editing, even when the region is empty. All addition uses **a**, without separate Add action items. The picker contains a bullet separator, flexible space, hidden widgets, then visible widgets. Adding a visible widget places a copy, so a widget, status, or built-in can appear in several rows and regions, but only once per row. Delete removes one copy; the widget becomes hidden only when its last copy is removed. To transfer a widget, add it to the destination row and delete it at the source. Unavailable saved IDs remain identifiable. Nested edits follow their row when live registrations shift it; if the row leaves the region, the menu returns to the row list without applying a stale keypress to another row.

Only Ctrl+S persists changes. While editing global scope, the regions show its draft even if a saved project override exists. After a global save, feedback explains that the project layout applies on close; the global draft stays visible until then. Saving an unchanged unset scope creates an explicit layout. **Reset to defaults** stages the extension's default layout for the selected scope; Ctrl+S saves it.

A failed save shows inline recovery without leaving the draft; Ctrl+S retries. Success feedback clears after three seconds, on edits, or on scope changes. Warnings and errors do not expire; failures remain until retry or switching scopes. Load warnings appear inline with details when space permits and refresh after saving. There is no separate details view or Save action row.

By default, native above/below widgets each occupy their own row. The footer contains:

```text
cwd • git branch • session title
tokens • context usage (auto)                  provider/model:thinking
extension status • extension status …
```

Any contribution can move to any region, share rows, and appear in several rows. The above-editor region reserves one leading blank line to separate it from the chat, even when empty. Empty widgets collapse without losing their positions. Bullet separators skip empty contributions but never cross flex or dangle beside continuation padding. On ragged multiline output, bullets align just before the following column, not after each preceding line's text.

Shared rows compact surplus plain trailing padding while preserving leading indentation, painted/decorated padding, and full-width singleton output. Native multiline components remain intact. Allocation recovers unused space once and prefers natural-width reflow when squeezing widgets together makes the output taller. Vertical clipping protects the editor and indicates omitted content. Arbitrary components have no preferred-size API, so allocation remains best effort rather than a global height optimizer.

## Configuration

Use the literal `ext.pi-editor-widgets` key in `getAgentDir()/settings.json` (normally `~/.pi/agent/settings.json`, respecting `PI_CODING_AGENT_DIR`) or the current directory's trusted `.pi/settings.json`. No ancestor search.

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
    }
  }
}
```

A project layout replaces the **entire** global layout; otherwise global settings or extension defaults apply. Empty regions do not hide unlisted or future registrations. New native widgets use their requested region; new statuses join a trailing footer row. Intentional suppression requires a hidden ID.

IDs are `widget:<native-key>`, `status:<native-key>`, and the six built-ins shown above. An ID may appear in several rows, at most once per row; hidden IDs must be unique and must not also be placed. Each row allows at most one `flex`. Unknown IDs are retained. Invalid layouts warn and fall back as a unit. Settings use the workspace's 1 MiB file limit; there are no size, priority, style, or overflow options. Preferences load on session start/reload and refresh when the menu opens.

## Side effects

This extension owns the entire footer while active. A competing `setFooter()` owner produces a conflict diagnostic; resolve it and `/reload`. Arbitrary custom footers are not merged. Native widgets and statuses remain supported without contributor changes.

Narrow runtime hooks borrow Pi's registries and component instances. Moving, duplicating, or hiding never creates or disposes a registered instance; Pi owns replacement, removal, and shutdown. Copies share that instance. Mouse dispatch restores the clicked copy's render width when needed, independently of its occupied hit area. Drag capture has [geometry limitations](docs/pi-compatibility.md#limitations-and-replacement-opportunities). Cleanup releases only owned hooks and UI, leaving later owners untouched.

Only Ctrl+S writes settings, using [locked atomic updates](../../libs/src/settings-file/README.md#behavior) that preserve unrelated fields and settings symlinks. Unreadable or malformed files/sections are not overwritten; an explicit save can replace an invalid layout inside a valid section while preserving other fields. No added network requests, polling services, or transcript entries. Hidden contributors retain their own side effects.

## Validation

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. See [coverage and terminal checks](docs/testing.md) and the [Pi compatibility checklist](docs/pi-compatibility.md).

The installed-host fixtures verify Pi 0.87.1's registration, renderer, reload, and footer contracts. Terminal interaction requires separate validation.
