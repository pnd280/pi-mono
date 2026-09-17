# Prompt browser and draft commands

[pi-prompt-manager](../README.md) · [Storage and recovery](storage.md)

## Keys and precedence

Configure Pi action IDs in `~/.pi/agent/keybindings.json`, or `$PI_CODING_AGENT_DIR/keybindings.json` when set, then run `/reload`. These bindings are separate from the extension's [launch shortcuts](../README.md#configuration).

| Default keys                    | Binding                                     | Action                                                                       |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Ctrl+C                          | `tui.input.copy`                            | Copy complete selected source; stay open                                     |
| Escape                          | `tui.select.cancel`                         | Close full preview or the view                                               |
| Enter                           | `tui.select.confirm`                        | Restore selection and close; inspection-only views close without restoring   |
| Up / Down                       | `tui.select.up` / `tui.select.down`         | Select a result or scroll full preview                                       |
| PageUp / PageDown               | `tui.select.pageUp` / `tui.select.pageDown` | Move a page of results or preview lines; fullscreen may intercept these keys |
| Tab / Shift+Tab                 | Fixed                                       | Switch collections; close preview and cancel confirmation                    |
| Ctrl+P                          | Fixed                                       | Open full preview                                                            |
| Alt+Enter                       | Fixed                                       | Drafts: restore first, then attempt removal                                  |
| Delete twice within 1.5 seconds | Fixed                                       | Delete the exact selected occurrence                                         |

Configured actions take precedence in this order: copy, cancel, confirm, up, down, page up, page down. Fixed browser controls come next, then search editing.

Action hints show the first usable binding, or label the action unavailable when none remains. If you bind copy to Enter, the restore hint shows another confirm binding or `restore unavailable`.

A configured action overrides any fixed control using the same key. Hints omit that key for the fixed action. For example, if a configured action uses Tab, Shift+Tab can still switch collections. Rebind the configured action to free the key, or use [numbered commands](#numbered-draft-commands) for draft actions.

With Pi's default fullscreen bindings, PageUp and PageDown scroll the transcript instead of the inline prompt view. To page results or preview text in that view, add these action bindings to `keybindings.json` and run `/reload`:

```json
{
  "tui.select.pageUp": "ctrl+pageUp",
  "tui.select.pageDown": "ctrl+pageDown"
}
```

If you have also rebound transcript scrolling, choose keys that it does not use.

Ctrl+C never cancels the browser, even when included in `tui.select.cancel`. It can still perform another configured action, including the default copy action.

To open the browser, cancel must have a binding other than Ctrl+C that copy does not also use. The browser does not add an Escape override.

If a modified key does not reach Pi, check [terminal key reporting](../../../../node_modules/@earendil-works/pi-coding-agent/docs/terminal-setup.md) or choose another binding.

## Search and refresh

Only one prompt-manager view can be open per session. History shows only the newest occurrence of each distinct trimmed prompt. Older occurrences remain stored and count toward retention. Saved drafts shows every save, including duplicates.

Search covers complete terminal-safe plain text. It ignores case and repeated whitespace, but preserves accents and Unicode forms. Literal phrases rank first, then all-term matches, then fuzzy matches. Selection stays on the same occurrence while it matches. Deletion moves selection to a nearby result.

Switch collections or reopen the browser to load fresh data or retry a failed read. There is no background refresh. The browser remembers queries and selection while open. Cancel returns to the editor, including during loading.

History uses editor text as its initial query only if the untrimmed text has one line and fewer than 100 Unicode code points. It then trims the query and makes it terminal-safe. Saved drafts starts with an empty query.

## Deletion

Press Delete twice within 1.5 seconds for the same occurrence. Other actionable input, refresh, resize, or expiration cancels confirmation. Key repeat and release events do not confirm deletion, but **legacy terminals cannot reliably distinguish a held Delete from separate presses**.

During deletion, only cancellation remains available. Cancel closes the browser immediately, including from full preview, but does not undo a deletion already underway. On failure, the query, selection, and preview remain; retry with a fresh confirmation. In History, deleting a visible occurrence can reveal an older duplicate, which needs its own confirmation.

## Copying

You can keep browsing during a copy, but cannot start another copy until it finishes. Closing the browser does not cancel the clipboard write; session expiry does.

## Presentation

Prompt content uses terminal-safe plain text, never Markdown. Copying preserves the entire source even when its display differs; [restoration](../README.md#restore-text) can refuse unsafe source.

Rows show compact ages and truncated prompt text. Future ages have a leading `+`; invalid timestamps display `Unknown time`. Open full preview to inspect complete text and an absolute timestamp with its timezone.

The list's `(selected/total)` counter refers to filtered results. [Numbered draft commands](#numbered-draft-commands) use positions in the full collection.

In full preview and inspection, the `↑ N more` and `↓ N more` border labels count hidden wrapped rows. The labels are hidden while layout loads and when all text fits.

Short terminals use an overlay; taller terminals use an inline view. Extra widgets or taller custom footers can reduce the available inline space. Resizing preserves browser state but cancels deletion confirmation. Below 40 columns × 10 rows, resize or cancel.

### Action feedback

Copy and removal results, warnings, and errors use Pi notifications without replacing keybinding hints. Search updates also leave hints visible.

Deletion confirmation and in-progress deletion temporarily replace the footer hints without moving the list. Confirmation lasts up to 1.5 seconds; hints return when confirmation or deletion ends.

Successful saves and removals include any cleanup warnings in the same notification. Numbered commands also use notifications for feedback. Operations that finish after the browser closes still notify while the session remains active.

## Numbered draft commands

Numbers refer to positions in the full saved-draft collection, not filtered results. Positions start at 1, newest first. Each command reloads the collection. Another session can change the order between commands.

Use positive decimal integers without leading zeros. Do not pass trailing arguments.

| Command                                  | Action                                                |
| ---------------------------------------- | ----------------------------------------------------- |
| `/prompts drafts show <n>`               | Inspect without restoring                             |
| `/prompts drafts copy <n>`               | Copy the numbered draft                               |
| `/prompts drafts restore <n>`            | Replace editor text, keeping the saved occurrence     |
| `/prompts drafts restore-and-remove <n>` | Restore, then attempt to delete that saved occurrence |
| `/prompts drafts delete <n>`             | Delete directly, without browser confirmation         |

`/prompts drafts show <n>` opens standalone inspection without collection tabs. Scrolling and copying work; confirm or cancel closes the view. Restoration, deletion, and collection switching are unavailable.

Restore commands follow the [editor safety rules](../README.md#restore-text). If removal fails after restoration, the restored text stays in the editor.
