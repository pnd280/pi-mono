# Browser controls

[Commands and settings](../README.md) · [Storage and recovery](storage.md)

The focused custom view opens before collection I/O finishes, inline in the editor area or as an overlay when the terminal is short. Closing the view returns to the editor. Loading is cancellable, and an unavailable collection remains distinct from an empty collection or a search with no matches. Switch away and back, or reopen, to retry a failed read. There is no watcher or polling.

Each collection reloads on activation, including switching back. Queries and selected occurrences are remembered only for that browser opening. Saved drafts starts with an empty query. The first History query comes from the original editor text only if it is nonblank, single-line, and shorter than 100 Unicode code points. CR, LF, Unicode line separators, and paragraph separators count as multiline.

## Keys and precedence

| Control                          | Action                                                                     |
| -------------------------------- | -------------------------------------------------------------------------- |
| `tui.input.copy`                 | Copy complete selected source; stay open                                   |
| `tui.select.cancel`              | Close full preview first, otherwise close the browser                      |
| `tui.select.confirm`             | Restore selection and close; inspection-only views close without restoring |
| `tui.select.up` / `down`         | Select a result or scroll full preview                                     |
| `tui.select.pageUp` / `pageDown` | Move a page of results or preview lines                                    |
| Tab / Shift+Tab                  | Switch collections; close preview and cancel confirmation                  |
| Ctrl+P                           | Full preview, without stacking previews                                    |
| Alt+Enter                        | Drafts: restore first, then attempt removal                                |
| Delete twice within 1.5 seconds  | Delete the exact selected occurrence                                       |

Configured actions take precedence in the order **copy, cancel, confirm, navigation/paging**, then fixed browser controls, then search editing. A fixed control claimed by a configured action is unavailable and omitted from hints. Configure another binding or use numbered commands where appropriate.

In fullscreen mode with an inline view, Pi handles unmodified PageUp/PageDown as transcript scrolling before the custom view. To page prompt results or preview text there, bind `tui.select.pageUp` / `tui.select.pageDown` to Ctrl+PageUp / Ctrl+PageDown or other keys not claimed by transcript scrolling.

Ctrl+C is excluded from cancellation, even when included in `tui.select.cancel`. It can still perform another configured action, including the default copy action. The browser refuses to open unless at least one cancel binding other than Ctrl+C is unshadowed by copying. It never invents an Escape override. Launch shortcuts in extension settings are independent of these browser action bindings.

## Selection and removal

Search lowercases and collapses whitespace. It does not remove accents or apply Unicode normalization. Literal phrase matches precede matches containing every literal term; remaining per-term fuzzy matches use Pi scores. Ties preserve collection order. Selection stays on the same occurrence while it remains matched, otherwise moves to the first match. After deletion, the nearby result at the former position is preferred, falling back to the previous result.

The Delete confirmation belongs to the selected occurrence. Other actionable input, selection/view changes, refresh, resize, or expiration cancels it. Reported Delete repeats and key releases do not confirm deletion; releases alone do not cancel confirmation. **Legacy terminals cannot reliably distinguish a held Delete from separate presses.** No timing heuristic attempts to infer this.

Deletion freezes search, navigation, view switching, and item actions; cancellation still closes the view. On failure, the query, selection, and preview remain, and another fresh confirmation is required. A successful mutation refreshes from its committed collection. In History, an older occurrence of the same text may immediately reappear and requires a new confirmation.

Restoration actions close the custom view before replacing editor text, after Pi restores its saved editor snapshot. Restore-and-remove then attempts deletion with the editor visible.

Closing does not undo a deletion already underway. Completion never reopens the browser. The active session receives the outcome; notifications and editor changes are suppressed after session expiry. A pending clipboard operation does not freeze browsing, scrolling, preview, or cancellation, but a second copy in the same session is rejected.

## Presentation

Prompt content is sanitized plain text, never Markdown. Display sanitation is separate from stored source and from the unsafe-control refusal used for restoration. Copy always receives the entire source, even when its display differs.

Views combine Pi's settings-style rows with its `/model` scope selector: `View: history | drafts` appears above search, with the active collection in the accent color and the other label and separator muted. Below it, `Tab view (history/drafts)` identifies the switching action; if Tab is claimed by another action, the hint uses Shift+Tab or disappears when both are claimed. A blank line separates the header from search outside compact layouts. Standalone inspection keeps its draft title and has no collection tabs or switching hint.

Thin themed borders, the native search input and `→` selection marker, aligned rows, and compact key hints follow Pi's settings selector. The list keeps selection near the center and shows at most ten results, with a position indicator when space permits. Rows have no numeric index. Compact ages (`now`, `5m`, `5h`, `2d`, `1w`, `1mo`, `1y`) appear in an aligned leading column before the prompt text, including at 40×10. Each prompt occupies one list row, truncated to the remaining width. Selection never adds a preview below the list. Age formatting matches Pi's session picker. Values round down, with 30-day months and 365-day years. Future ages have a leading `+`, such as `+5h`; timestamps within one minute display `now`. Full preview is scrollable and retains absolute time with a timezone. Invalid timestamps display `Unknown time`. Numbered draft commands still use full collection positions, unchanged by filtering.

Full preview and standalone inspection use Pi's editor-style `↑ N more` and `↓ N more` labels in their top and bottom borders. Counts describe hidden wrapped display rows and update with scrolling and resizing; they disappear when everything fits or while preview layout is still being prepared. They consume no additional rows or columns and remain visible at 40×10. Lists have no border overflow labels and use only their `(selected/total)` position counter for the current search results when space permits.

Smaller views remove optional spacing, place `history | drafts` in the top border, and move the switching hint to the footer. Active status messages temporarily replace the compact tabs; standalone inspection uses its title instead. Long compact headings are truncated to leave room for the upper overflow label. Footer hints share one row when they fit and wrap between complete hints only as needed. Key hints show the first configured binding for each action; other configured bindings still work. The inline height budget is `floor((terminal rows - 3) × 0.75)`, reserving three rows for Pi's default spacer and footer. When this budget is below **12 rows**, the view uses `overlay: true`, centered at full width and capped at `floor(terminal rows × 0.75)` rows. Otherwise it uses `overlay: false`. Thus the default layout switches to an overlay below 19 terminal rows; at 80×24, inline content is capped at 15 rows. Taller custom footers and extra widgets are not included in the three-row allowance.

Height and presentation are recalculated on resize. Crossing the threshold preserves the query, search cursor, selected occurrence, preview scroll position, and pending operations without rereading the collection. Deletion confirmation is cancelled. The minimum supported browsing size remains 40×10. Below the minimum, the view shows a resize message and retains cancellation.

`drafts show <n>` is standalone inspection: scrolling/copying work, confirm/cancel closes, and restoration, deletion, and collection switching are unavailable.
