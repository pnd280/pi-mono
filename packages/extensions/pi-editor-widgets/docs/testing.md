# Widget validation

[pi-editor-widgets](../README.md)

## Automated coverage

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. Settings-write changes also require `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

| Coverage                                                                                                  | Tests                                               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Native registration/disposal ownership, copied mouse targets, invalidation, clipping and footer conflicts | [Coordinator](../validation/coordinator.test.ts)    |
| Reloads, session changes, renderer switches, resize, inactive non-TUI modes                               | [Lifecycle](../validation/lifecycle.test.ts)        |
| Native usage, context, runtime compaction, model, session and branch data                                 | [Built-ins](../validation/builtins.test.ts)         |
| Scoped save/retry, draft retention, live previews and identity-preserving navigation                      | [Menu](../validation/menu.test.ts)                  |
| Arguments, scopes, warnings, mounted resize/cancellation and editor/layout restoration                    | [Commands](../validation/settings-commands.test.ts) |
| Shared rows, ANSI/wide text, multiline output, separators, flex, whole-widget wrapping and clipping       | [Rendering](../src/render.test.ts)                  |
| Default discovery, hidden/unknown IDs, cross-row copies, in-row duplicate and flex rejection              | [Layout](../src/layout.test.ts)                     |
| Trust, scope precedence, invalid files, unrelated fields and lock contention                              | [Settings](../src/settings.test.ts)                 |
| Hiding, adding, copies, transfers, independent scopes, inherited navigation and reorder boundaries        | [Drafts](../src/drafts.test.ts)                     |

Context coverage must distinguish zero usage, unavailable usage after compaction, and recovered usage from a later response. Check used/window token formatting, the percentage and runtime auto-compaction indicator, default percentage color boundaries, and each configured token-threshold band.

Settings must resolve the threshold independently from the layout, ignore untrusted project values, recover invalid fields through the next scope, and preserve the threshold on layout saves. Opening `/widgets` must apply external threshold edits or removal without requiring a save or writing settings.

Shared-row coverage must include Pi's native string-array widgets (`Container`/`Text`), not only unpadded text factories. Protect ordered, whole-widget wrapping, including when squeezing could produce fewer lines. Each placement renders once at the terminal width, never at a smaller allocation: responsive content and visibility depend on terminal size, not neighbours. Test exact row membership and order, including when a later small widget could fit on an earlier row; exact fits including separators; row height determined by the tallest widget; and widening back into shared rows.

Retain compact plain padding without losing content, painted/decorated/linked padding, full-width borders, leading indentation, singleton padding and blank lines, separator alignment on ragged lines, flex alignment, and ANSI/wide-character width bounds. Separators must collapse across empty widgets without dangling at wrapped row boundaries. Nested mouse dispatch must use the full render width, even for compacted, wrapped, or duplicated widgets. The coordinator must reuse measured placements across region reads and mouse dispatch instead of rendering them again.

Shared frame sizing, feedback, scope markers, sanitization, and controls are covered by [settings-menu tests](../../../libs/src/tui/components/settings-menu/index.test.ts), rather than repeated per consumer. Widget tests protect domain navigation, live draft previews, and integration with the shared frame.

Successful save feedback expires after three seconds and requests a redraw; another save restarts that deadline. Replacing success with a warning or error must keep that diagnostic visible, and closing or disposing the menu cancels pending expiry.

The above-editor region must retain exactly one leading blank line when populated or empty in both renderers, including after release to native rendering; height budgets include it, and mouse events on it must not reach widgets. Removing a copy must leave other placements visible and nested edits on the intended row. Mouse dispatch must retain the clicked copy's render width even when flex leaves a narrower hit area. Mounted menus must restore the saved layout on host cancellation as well as explicit closure, in both renderers.

The [shared interactive host fixture](../../../libs/src/validation/interactive-host/README.md) uses installed Pi registration implementations, `AgentSession`, both renderers, the stable UI proxy, and the native fullscreen dock. This package owns widget scenarios. Temporary settings and offline model runtime are isolated. Tests do not send model requests or add extension-owned transcript entries. Session boundary tests emit native shutdown/start around an in-memory session reset; they do not drive an interactive session picker.

## Terminal checks

Use workspace Pi with this extension and a native widget contributor such as `pi-todo`. No model call is needed for the menu itself.

1. Open `/widgets` in regular and fullscreen modes. Resize while navigating and editing. Verify non-overlay operation, retained selection and drafts, working controls, and editor focus after closing. Edits must appear in the actual regions without another live widget instance, the menu must leave those regions visible when space allows, and closing without saving must restore the saved layout.
2. Reorder, hide, re-add and duplicate widgets with **a**; click each copy of a mouse-aware widget. Check empty rows and regions, unavailable saved IDs, and registration changes while editing. One blank line must separate the chat from the above-editor region, including when all its widgets are empty. New registrations must not retarget the selected widget. Native placement changes must preserve the nested row's identity or return to the row list without applying stale input.
3. Check the footer and `/widgets` at 80×24 and 40×10, in dark and light themes. Narrow footer rows should wrap whole fields in order instead of squeezing them into columns, even if that takes more lines; widening must restore shared rows. Check active-scope highlighting, unset/dirty markers, path and overflow labels, fixed bounded navigation, and save/exit hints. An unchanged unset-scope save must create that override. Verify independent drafts and one-way project inheritance; a global save must not retarget inherited nested edits. **Reset to defaults** remains staged until Ctrl+S.
4. Hold a settings lock or use malformed JSON; failed saves must retain edits, keep the selected target and recovery visible, and allow Ctrl+S retry. Load/save warnings must not appear as unconditional success or duplicate notifications. Success clears after three seconds, actual edits, or scope changes; warnings and errors do not expire. Fixing and reopening clears load warnings.
5. Exercise `/reload`, new/resumed sessions, and renderer switching. Verify cleanup, registration updates, editor availability, and native mouse interactions.
6. Check both load orders with a separate custom-footer extension. Verify the conflict diagnostic, then disable the competing footer and reload to reacquire ownership.
7. Using a session with known context usage, compare the [context color bands](../README.md#context-usage) in dark and light themes. Change or remove `contextThreshold` in settings, reopen `/widgets`, and close without saving. The new color must apply immediately and remain after closing, without rewriting settings.

Automated renderer checks do not establish physical-terminal interaction behavior.
