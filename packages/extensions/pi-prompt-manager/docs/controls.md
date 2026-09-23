# Prompt browser and draft commands

[pi-prompt-manager](../README.md) · [Storage and recovery](storage.md)

## Keys and precedence

Set Pi action IDs in `~/.pi/agent/keybindings.json` (or `$PI_CODING_AGENT_DIR/keybindings.json`), then `/reload`. These differ from [launch shortcuts](../README.md#configuration).

| Default                         | Binding                                     | Action                                                  |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Ctrl+C                          | `tui.input.copy`                            | Copy complete source; stay open                         |
| Escape                          | `tui.select.cancel`                         | Close preview or view                                   |
| Enter                           | `tui.select.confirm`                        | Restore and close; inspection only closes               |
| Up / Down                       | `tui.select.up` / `tui.select.down`         | Select or scroll preview                                |
| PageUp / PageDown               | `tui.select.pageUp` / `tui.select.pageDown` | Page results/preview                                    |
| Tab / Shift+Tab                 | Fixed                                       | Switch collections; retain preview, cancel confirmation |
| Ctrl+P                          | Fixed                                       | Full preview                                            |
| Alt+Enter                       | Fixed                                       | Drafts: restore, then attempt deletion                  |
| Delete twice within 1.5 seconds | Fixed                                       | Delete exact selection                                  |

Precedence: copy, cancel, confirm, up, down, page up, page down, fixed controls, search editing. Hints show the first usable binding or mark the action unavailable. Binding copy to Enter uses another confirm key for restore, or shows `restore unavailable`.

Configured actions override conflicting fixed keys; hints omit those keys. If Tab conflicts, Shift+Tab may still switch collections. Rebind to free a key or use [numbered commands](#numbered-draft-commands).

Ctrl+C never cancels, even in `tui.select.cancel`; it may perform another configured action, including copy. Opening requires a cancel key other than Ctrl+C that copy does not use. No Escape override is added.

For missing modified keys, check [terminal reporting](../../../../node_modules/@earendil-works/pi-coding-agent/docs/terminal-setup.md) or rebind.

### Fullscreen paging

While an inline browser has focus, paging moves the list or preview without scrolling the transcript. This includes remapped paging keys that survive the precedence above. At scroll boundaries or while navigation is temporarily ignored, paging still does not scroll the transcript.

Search overlays and other dialogs receive input while focused. Closing the browser restores transcript paging. If fullscreen routing is unavailable, a warning appears once per opening; the browser stays open and arrow navigation remains available. See the [shared routing contract](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership) for host compatibility and effects on other extensions.

## Search and refresh

One view may open per session. History displays the newest occurrence of each distinct trimmed prompt; older duplicates remain stored and count toward retention. Drafts display every save.

Search covers complete terminal-safe plain text, ignoring case/repeated whitespace but preserving accents and Unicode forms. Ranking: literal phrase, all terms, fuzzy. Selection stays on a matching occurrence; deletion selects a nearby result.

Switch collections or reopen to refresh/retry reads; no background refresh. Queries/selections persist while open. Cancel returns to the editor even during loading.

Switching collections in preview shows the other selection from the top, or returns to the list for empty collections, no matches, or read failures.

History seeds its query from editor text only when untrimmed text is one line and under 100 Unicode code points, then trims/sanitizes it. Drafts start empty.

## Deletion

Delete twice within 1.5 seconds on the same entry. Other actionable input, refresh, resize, or expiry cancels confirmation. Repeat/release events cannot confirm, but **legacy terminals cannot reliably distinguish held Delete from separate presses**.

Deletion hints appear only for removable selections. During deletion, the footer shows progress and the close key. Only cancel works; it closes immediately, even from preview, without undoing started deletion. Failure retains query, selection, and preview; retry requires fresh confirmation. Deleting History may reveal an older duplicate requiring its own confirmation.

## Copying

Browsing remains available during copy, but another copy must wait. Closing does not cancel the write; session expiry does.

## Presentation

Display uses terminal-safe plain text, never Markdown. Copy preserves full source; [restoration](../README.md#restore-text) can reject unsafe source.

Tabs are labeled **History** and **Saved drafts**. Compact layouts keep these labels above recovery status. `Read-only` still permits copy and restoration; `Recovery: additions disabled` permits deletion as well. Restore-then-delete still attempts both steps, reporting any deletion failure without undoing restoration.

Future ages start with `+`; invalid timestamps show `Unknown time`. Full preview includes complete text and an absolute timestamp with timezone.

`(selected/total)` counts filtered results; [numbered commands](#numbered-draft-commands) index the full collection. Preview/inspection border labels `↑ N more` and `↓ N more` count hidden wrapped rows.

Short terminals use overlays; taller ones use inline views, whose space widgets/custom footers may reduce. Resize preserves state but cancels deletion confirmation. Below 40×10, resize or cancel.

## Action feedback

Copy, save, deletion, and numbered commands use Pi notifications. Successful mutations include cleanup warnings. Operations finishing after closure still notify while the session is active.

## Numbered draft commands

Positions are 1-based, newest-first, in the full collection. Each command reloads; concurrent sessions can reorder entries. Use positive decimal integers without leading zeros or trailing arguments.

| Command                                  | Action                              |
| ---------------------------------------- | ----------------------------------- |
| `/prompts drafts show <n>`               | Inspect without restoring           |
| `/prompts drafts copy <n>`               | Copy                                |
| `/prompts drafts restore <n>`            | Replace editor text; retain entry   |
| `/prompts drafts restore-and-delete <n>` | Restore, then attempt deletion      |
| `/prompts drafts delete <n>`             | Delete without browser confirmation |

`show` opens standalone inspection: scroll/copy work; confirm/cancel close. No tabs, restoration, deletion, or collection switching.

Restore commands follow [editor safety rules](../README.md#restore-text); failed deletion leaves restored editor text intact.
