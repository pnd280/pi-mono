# Prompt browser and draft commands

[pi-prompt-manager](../README.md) · [Storage and recovery](storage.md)

## Keys and precedence

Browser keys are Pi action IDs, set in `~/.pi/agent/keybindings.json` (or `$PI_CODING_AGENT_DIR/keybindings.json`); run `/reload` after changing them. They're separate from the [launch shortcuts](../README.md#configuration) that open the browser.

### Cancellation safety

**Ctrl+C** never cancels, even when bound to `tui.select.cancel`, though it can perform another configured action such as copy. The browser opens only if some key other than **Ctrl+C**, not also used for copy, is bound to cancel. No **Escape** override is added.

### Action precedence

| Default                             | Binding                                    | Action                                                               |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **Ctrl+C**                          | `tui.input.copy`                           | Copy the complete text and stay open.                                |
| **Escape**                          | `tui.select.cancel`                        | Close the preview or view.                                           |
| **Enter**                           | `tui.select.confirm`                       | Restore and close. In inspection, only close.                        |
| **Up**, **Down**                    | `tui.select.up`, `tui.select.down`         | Select, or scroll the preview.                                       |
| **PageUp**, **PageDown**            | `tui.select.pageUp`, `tui.select.pageDown` | Page through results or the preview.                                 |
| **Tab**, **Shift+Tab**              | Fixed                                      | Switch collections, keeping the preview and cancelling confirmation. |
| **Ctrl+P**                          | Fixed                                      | Full preview.                                                        |
| **Alt+Enter**                       | Fixed                                      | In drafts, restore, then try to delete.                              |
| **Delete** twice within 1.5 seconds | Fixed                                      | Delete the exact selection.                                          |

When one key is bound to several actions, the first in this order wins: copy, cancel, confirm, up, down, page up, page down, fixed controls, then search editing.

- Hints skip invalid keys and keys that Pi 1.3.0 can't dispatch, such as modified **Escape** and modified function keys.
- Hints also skip a key that sends the same input as a key of an earlier action. For example, **Ctrl+[** and **Escape** send the same byte in some terminals.
- Hints show the first usable binding for each action, or mark the action unavailable. For example, if copy is bound to **Enter**, restore uses another confirm key, or the hint shows "restore unavailable".
- Configured actions override fixed keys they conflict with, and hints leave those keys out. If **Tab** conflicts, **Shift+Tab** may still switch collections. To free a key, rebind it, or use the [numbered commands](#numbered-draft-commands).

If modified keys don't arrive, check your [terminal setup](https://pi.dev/docs/latest/terminal-setup) or rebind them.

### Fullscreen paging

While an inline browser has focus, resolved browser actions take priority over transcript controls. Paging moves the list or preview, never the transcript, including at scroll boundaries and while navigation is briefly ignored. Remapped cancel, confirm, and selection actions use the same priority route.

- Search overlays and other dialogs get input while they have focus.
- Closing the browser gives paging back to the transcript.
- Keys that the browser handles don't reach other extensions while it has focus.
- If fullscreen routing is unavailable, a warning appears once per opening. The browser stays open; use regular mode if controls do not respond.

## Search and refresh

Only one view can be open per session.

- "History" shows the newest occurrence of each distinct trimmed prompt. Older duplicates stay stored and count toward retention.
- "Saved drafts" shows every save.

### Search

- Search covers the complete terminal-safe plain text. It ignores case and repeated whitespace, but not accents or Unicode forms.
- Results rank literal phrases first, then matches of all terms, then fuzzy matches.
- While you type, the previous results stay visible until the search finishes. If a search takes longer than 200 ms, "Searching collection…" replaces the results and their action hints.
- While a search is pending, you can only edit the search, switch collections, or cancel.
- Editing the search selects the first result. Otherwise, the selection stays on a matching occurrence. After a deletion, a nearby result is selected.
- "History" fills the search from the editor text when the untrimmed text is a single line under 100 Unicode code points, then trims and sanitises it.
- "Saved drafts" starts with an empty search.

### Refresh

- Nothing refreshes in the background. Switch collections or reopen the browser to refresh, or to retry a failed read.
- Searches and selections are kept while the browser is open.
- Cancelling returns to the editor, even while loading.
- Switching collections in the preview shows the other collection's selection from the top. If that collection is empty, has no matches, or failed to read, you return to the list.

## Deletion

Press **Delete** twice within 1.5 seconds on the same entry.

- Any other actionable input, a refresh, a resize, or the time running out cancels the confirmation.
- Key repeat and key release events can't confirm. Legacy terminals can't reliably tell a held Delete from two presses.
- Deletion hints appear only when the selection can be removed.

While deleting:

- The footer shows progress and the close key. Only cancel works. It closes immediately, even from the preview, but doesn't undo a deletion that has started.
- If deletion fails, the search, selection, and preview are kept. Retrying needs a fresh confirmation.
- Deleting from "History" may reveal an older duplicate, which needs its own confirmation.

## Copying

You can keep browsing while a copy is in progress, but another copy is refused with a warning until the first finishes. Closing the browser doesn't cancel the write; ending the session does.

## Presentation

Text is shown as terminal-safe plain text, never Markdown. Copying keeps the full original text, but [restoring](../README.md#restore-text) can reject unsafe text.

### Tabs and status

- Tabs are labelled "History" and "Saved drafts". Compact layouts keep the labels above the recovery status.
- "Read-only" still allows copying and restoring. "Recovery: additions disabled" also allows deletion.
- Restore-then-delete still attempts both steps. A deletion failure is reported without undoing the restore.

### Entries

- Ages at least one minute in the future start with `+`. Ages less than one minute away show "now". Invalid timestamps show "Unknown time".
- The full preview shows the complete text and an absolute timestamp with time zone.
- `(selected/total)` counts filtered results, but the [numbered commands](#numbered-draft-commands) number the full collection.
- In the preview and inspection, the border labels "↑ N more" and "↓ N more" count hidden wrapped rows.

### Layout

- Short terminals use overlays. Taller ones use inline views, which may get less space when widgets or custom footers are present.
- Resizing keeps the state but cancels a deletion confirmation.
- Below 40 columns by 10 rows, resize or cancel.

## Action feedback

Copy, save, deletion, and numbered commands report through Pi notifications. Successful changes include cleanup warnings. Operations that finish after the browser closes still notify, as long as the session is active.

## Numbered draft commands

Numbers start at 1, newest first, across the full collection. Each command reloads the collection, so another session can change the order. Use a positive decimal number, without leading zeros or extra arguments.

| Command                                  | Action                                      |
| ---------------------------------------- | ------------------------------------------- |
| `/prompts drafts show <n>`               | Inspect without restoring.                  |
| `/prompts drafts copy <n>`               | Copy.                                       |
| `/prompts drafts restore <n>`            | Replace the editor text and keep the draft. |
| `/prompts drafts restore-and-delete <n>` | Restore, then try to delete.                |
| `/prompts drafts delete <n>`             | Delete without the browser's confirmation.  |

`show` opens a standalone inspection view. Scrolling and copying work, and confirm or cancel closes it. There are no tabs, restoring, deletion, or collection switching.

Restore commands follow the [editor safety rules](../README.md#restore-text). If deletion fails, the restored text stays in the editor.
