# Widget validation

[pi-editor-widgets](../README.md) · [Compatibility](pi-compatibility.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). For maintainers: this package tests layout, rendering, settings, the `/widgets` menu, and the usage widgets.

## Automated coverage

Run [package validation](../README.md#validation). Changes to settings writes also need `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

| Layer                                                                               | Covers                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed-host integration in [validation/](../validation/)                         | Ownership, lifecycle, native metrics, the menu, and commands.                                                                                                             |
| Tests beside the source                                                             | Pure layout, rendering, settings, and draft navigation through semantic actions and snapshots.                                                                            |
| [Settings-menu tests](../../../libs/src/tui/components/settings-menu/index.test.ts) | Shared frame sizing, feedback, scope markers, sanitisation, and controls. Widget tests cover only domain navigation, live draft previews, and integration with the frame. |

The shared [interactive host fixture](../../../libs/src/validation/interactive-host/README.md) provides installed Pi registration, both renderers, and isolated offline settings. It sends no model requests.

Settings tests here cover widget-section validation, externally unset layouts, scope and trust policy, and consumer handling of malformed files and locks. The shared [settings-file tests](../../../libs/src/settings-file/index.test.ts) own the file-size boundary.

[Drafts](../src/drafts.ts) owns per-scope navigation and selection identity. Its tests cover saved-global inheritance, independent draft baselines after reloads, exact inherited-row rebasing, and duplicate row occurrences. Installed-host menu tests exercise native registration changes through the same navigation interface, including stale input without a render, nested rows, separators, and identical empty rows. Menu callers neither mutate view stacks nor invalidate identity caches.

### Must not regress

- Clicks and opening `/widgets` never write settings. Untrusted project values are ignored.
- Clicking a usage widget never takes focus, and typing afterwards reaches the editor.
- Mounted menus restore the saved layout on host cancellation as well as explicit closure, in both renderers. Closing after a global save reapplies the saved project override.
- Removing one copy leaves the other placements visible, and nested edits stay on the intended row.

### Token widget

- Totals use native counts across assistant, tool, usage, compaction, and branch entries. The cache-hit percentage comes from the latest prompt.
- Fullscreen compact mode shows only nonzero input and output counts. It omits cache read and write totals, cache-hit percentages, cost, and subscription markers.
- Verbose and regular displays keep the original full details.
- Cover empty usage, cache-only usage, and input-only and output-only counts.

### Context widget

Cover zero usage, unavailable usage after compaction, and usage recovered by a later response, in the regular display and in fullscreen compact and verbose modes. Check:

- used and window token formatting;
- percentages omitted in compact mode, and shown in verbose mode with the runtime auto-compaction threshold;
- the default percentage colour boundaries, and each configured token-threshold band.

The compaction threshold combines the routed physical window with Pi's effective reserve for the selected model. It follows native settings and model changes, and is independent of the colour threshold. Missing windows and invalid compaction settings must not break rendering.

An offline faux-provider case must:

- tell the selected model's reserve apart from the physical model's override;
- confirm native compaction timing on either side of the displayed threshold;
- label the model as the selected virtual model, then `→`, then the routed physical model with its requested thinking level when it supports reasoning;
- show no arrow before the first routed response.

Before routing, an undeclared virtual window stays unknown in every display mode and never produces a numeric threshold.

### Mouse toggling

Fullscreen:

- A primary click in any region toggles every copy of the selected usage widget exactly once, and requests a redraw.
- Token and context widgets toggle independently, without mounting a menu.
- Other buttons and unrelated mouse events are ignored.
- Use native terminal press and release input on wrapped rows at 40×10, with a redraw between press and release. Pi's captured target must still toggle once.
- Selections survive layout edits and a round trip through regular mode, and reset on reload.

Regular mode keeps the original context and full token displays, and leaves mouse input on usage widgets unhandled.

`/widgets` accepts no arguments and only opens the layout menu.

### Context-colour settings

- The threshold resolves separately from the layout, and recovers from invalid fields using the next scope.
- Layout saves keep the threshold.
- Opening `/widgets` applies external edits or removal of the threshold, without a save and without writing settings.

### Shared rows

Include Pi's native string-array widgets (`Container` and `Text`), not only unpadded text factories.

Wrapping:

- Each placement renders once at terminal width, never at a smaller allocation. Responsive content and visibility depend on terminal size, not on neighbours.
- Whole widgets wrap in order, even when squeezing could save lines.
- Test exact row membership and order, including when a later small widget could fit on an earlier row.
- Test exact fits including separators, row height set by the tallest widget, and widening back into shared rows.

Padding and alignment are kept for:

- compact plain padding, without losing content;
- painted, decorated, and linked padding;
- full-width borders, leading indentation, singleton padding, and blank lines;
- separator alignment on ragged lines, flex alignment, and ANSI and wide-character width bounds.

Separators collapse across empty widgets and never dangle at the end of a wrapped row.

The [image placement policy](../README.md#usage) is tested with native `Image` output for Kitty and iTerm2. Cases cover image-only output, a captioned container, shared-row neighbours, repeated placements, exact payload and blank-row preservation, and whole-widget clipping with matching mouse cells. Capability overrides are restored after each case; no image is sent to a physical terminal.

### Mouse dispatch

- Nested dispatch uses the full render width, even for compacted, wrapped, or duplicated widgets.
- Dispatch keeps the clicked copy's render width even when flex leaves a narrower hit area.
- The coordinator reuses measured placements across region reads and mouse dispatch instead of rendering again.

### Above-editor region

- The region keeps exactly one leading blank line, whether populated or empty, in both renderers and after release to native rendering.
- Height budgets include that line, and mouse events on it never reach widgets.

### Save feedback

- Success feedback expires after three seconds and requests a redraw. Another save restarts the timer.
- A warning or error that replaces success stays visible.
- Closing or disposing the menu cancels pending expiry.

### Not covered automatically

- Session boundary tests emit native shutdown and start around an in-memory reset. They don't drive the interactive session picker.
- Tests don't establish physical-terminal behaviour or visual quality.

## Terminal checks

Setup: workspace Pi with this extension and a native widget contributor such as `pi-todo`. The menu needs no model call.

### Menu

| Do                                                                                          | Expect                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open `/widgets` in regular and fullscreen modes; resize while editing                       | The menu is not an overlay. Selection, drafts, and controls keep working. The editor has focus after closing.                                        |
| Make edits                                                                                  | They show in the real regions without another live widget instance. Regions stay visible when there's room.                                          |
| Close without saving                                                                        | The saved layout is restored.                                                                                                                        |
| Reorder, hide, re-add, and copy widgets with **a**; click each copy of a mouse-aware widget | Every copy responds.                                                                                                                                 |
| Leave rows and regions empty; include unavailable saved IDs; register widgets while editing | One blank line separates chat from the above-editor region, even when all its widgets are empty. New registrations don't change the selected widget. |
| Change a native placement while a nested row is open                                        | The nested row keeps its identity, or the menu returns to the row list without applying stale input.                                                 |

### Layout and scopes

Setup: check at 80×24 and 40×10, in dark and light themes.

| Do                                    | Expect                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Narrow the terminal                   | Footer rows wrap whole fields in order rather than squeezing them into columns. Widening restores shared rows.                     |
| Look over the menu                    | Active-scope highlight, unset and changed markers, path and overflow labels, bounded navigation, and save and exit hints all show. |
| Save an unchanged scope that is unset | The override is created.                                                                                                           |
| Edit global and project drafts        | They stay independent, and inheritance runs one way from global to project. A global save doesn't move inherited nested edits.     |
| Choose "Reset to defaults"            | The default layout previews immediately. Settings stay unchanged until **Ctrl+S**.                                                 |

### Save failures

Setup: hold a settings lock, or make the settings file malformed JSON.

| Do                                          | Expect                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Save                                        | Edits are kept, the selected target and recovery message stay visible, and **Ctrl+S** retries.    |
| Watch notifications                         | Load and save warnings never show as success or appear twice.                                     |
| Wait, edit, or switch scope after a success | Success clears after three seconds, an edit, or a scope change. Warnings and errors don't expire. |
| Fix the file and reopen                     | Load warnings clear.                                                                              |

### Lifecycle

| Do                                                         | Expect                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Run `/reload`, start and resume sessions, switch renderers | Cleanup, registration updates, editor availability, and native mouse interactions all work.   |
| Load a separate custom-footer extension, in both orders    | A conflict diagnostic appears. Disabling the other footer and reloading gives ownership back. |

### Context widget

Setup: a session with known context usage. Compare the [context colour settings](settings.md#context-colours) in dark and light themes.

| Do                                                                           | Expect                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Click the context widget in fullscreen                                       | Compact hides the percentage. Verbose shows it with the automatic compaction threshold.        |
| Switch to regular mode, then back                                            | Regular keeps the original percentage and `(auto)`. Fullscreen restores the earlier choice.    |
| Click copies in every region and on wrapped rows                             | Every copy updates, and the editor keeps focus.                                                |
| Compare the threshold with Pi's effective model reserve; compact the session | The threshold matches. Usage shows as unknown after compaction.                                |
| Change or remove `contextThreshold`, reopen `/widgets`, close without saving | The new colour applies at once and stays, without rewriting settings or changing display mode. |

### Token widget

Setup: a session with known token usage, in fullscreen.

| Do                                 | Expect                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click the token widget             | Compact shows only input and output counts. Verbose restores cache read and write totals, cache-hit percentage, cost, and subscription markers where they apply. |
| Click with copies placed elsewhere | All copies switch together. The context widget's mode and editor focus don't change.                                                                             |
| Switch to regular mode, then back  | Regular keeps the full display. Fullscreen restores the earlier choice.                                                                                          |
