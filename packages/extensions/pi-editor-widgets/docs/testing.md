# Widget validation

[pi-editor-widgets](../README.md)

## Automated coverage

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. Settings-write changes also require `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

| Coverage                                                                                                 | Tests                                                |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Native registration, replacement/removal, runtime compaction state, footer ownership                     | [Host contract](../validation/host-contract.test.ts) |
| Borrowed instances, copied/nested mouse targets, invalidation, live drafts, clipping, conflicts          | [Coordinator](../validation/coordinator.test.ts)     |
| Reloads, session changes, renderer switches, resize, inactive non-TUI modes                              | [Lifecycle](../validation/lifecycle.test.ts)         |
| Native usage, context, runtime state, model, session and branch data                                     | [Built-ins](../validation/builtins.test.ts)          |
| Scoped save/retry, draft retention, live previews, selection, navigation and resizing                    | [Menu](../validation/menu.test.ts)                   |
| Command arguments, scopes, warnings, mounted rendering and draft/editor restoration on host cancellation | [Commands](../validation/settings-commands.test.ts)  |
| Shared rows, ANSI/wide text, multiline output, separators, flex, reflow and clipping                     | [Rendering](../src/render.test.ts)                   |
| Default discovery, hidden/unknown IDs, cross-row copies, in-row duplicate and flex rejection             | [Layout](../src/layout.test.ts)                      |
| Trust, scope precedence, invalid files, unrelated fields and lock contention                             | [Settings](../src/settings.test.ts)                  |
| Hiding, adding, copies, transfers, independent scopes, inherited navigation and reorder boundaries       | [Drafts](../src/drafts.test.ts)                      |

Shared frame sizing, feedback, scope markers, sanitization, and controls are covered by [settings-menu tests](../../../libs/src/tui/components/settings-menu/index.test.ts), rather than repeated per consumer. Widget tests protect domain navigation, live draft previews, and integration with the shared frame. Removing a copy must leave other placements visible and nested edits on the intended row. Mouse dispatch must retain the clicked copy's render width even when flex leaves a narrower hit area. Mounted menus must restore the saved layout on host cancellation as well as explicit closure, in both renderers.

The [shared interactive host fixture](../../../libs/src/validation/interactive-host/README.md) uses installed Pi registration implementations, `AgentSession`, both renderers, the stable UI proxy, and the native fullscreen dock. This package owns widget scenarios. Temporary settings and offline model runtime are isolated. Tests do not send model requests or add extension-owned transcript entries. Session boundary tests emit native shutdown/start around an in-memory session reset; they do not drive an interactive session picker.

## Terminal checks

Use workspace Pi with this extension and a native widget contributor such as `pi-todo`. No model call is needed for the menu itself.

1. Open `/widgets` in regular and fullscreen modes. Resize while navigating and editing. Verify non-overlay operation, retained selection and drafts, working controls, and editor focus after closing. Edits must appear in the actual regions without another live widget instance, the menu must leave those regions visible when space allows, and closing without saving must restore the saved layout.
2. Reorder, hide, re-add and duplicate widgets with **a**; click each copy of a mouse-aware widget. Check empty rows and regions, unavailable saved IDs, and registration changes while editing. New registrations must not retarget the selected widget. Native placement changes must preserve the nested row's identity or return to the row list without applying stale input.
3. Check `/widgets` at 80×24 and 40×10, in dark and light themes. Check active-scope highlighting, unset/dirty markers, path and overflow labels, fixed bounded navigation, and save/exit hints. An unchanged unset-scope save must create that override. Verify independent drafts and one-way project inheritance; a global save must not retarget inherited nested edits. **Reset to defaults** remains staged until Ctrl+S.
4. Hold a settings lock or use malformed JSON; failed saves must retain edits, keep the selected target and recovery visible, and allow Ctrl+S retry. Load/save warnings must not appear as unconditional success or duplicate notifications. Success clears after actual edits or scope changes; fixing and reopening clears load warnings.
5. Exercise `/reload`, new/resumed sessions, and renderer switching. Verify cleanup, registration updates, editor availability, and native mouse interactions.
6. Check both load orders with a separate custom-footer extension. Verify the conflict diagnostic, then disable the competing footer and reload to reacquire ownership.

Automated renderer checks do not establish physical-terminal interaction behavior.
