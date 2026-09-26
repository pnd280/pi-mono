# Widget validation

[pi-editor-widgets](../README.md)

## Automated coverage

Run `vpr 'pi-editor-widgets#check'` and `vpr 'pi-editor-widgets#test'` from the workspace root. Settings-write changes also require `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

| Coverage                                                                                   | Tests                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Native registration, replacement/removal, runtime compaction state, footer ownership       | [Host contract](../validation/host-contract.test.ts) |
| Moved/hidden instances, mouse targets, invalidation, passive previews, clipping, conflicts | [Coordinator](../validation/coordinator.test.ts)     |
| Reloads, session changes, renderer switches, resize, inactive non-TUI modes                | [Lifecycle](../validation/lifecycle.test.ts)         |
| Native usage, context, runtime state, model, session and branch data                       | [Built-ins](../validation/builtins.test.ts)          |
| Scoped save/retry, draft retention, passive previews, selection, navigation and resizing   | [Menu](../validation/menu.test.ts)                   |
| Widget command arguments, in-menu scopes, precedence, warnings and editor restoration      | [Commands](../validation/settings-commands.test.ts)  |
| Shared rows, ANSI/wide text, multiline output, separators, flex, reflow and clipping       | [Rendering](../src/render.test.ts)                   |
| Default discovery, hidden/unknown IDs, duplicate and flex rejection                        | [Layout](../src/layout.test.ts)                      |
| Trust, scope precedence, invalid files, unrelated fields and lock contention               | [Settings](../src/settings.test.ts)                  |
| Hiding, adding, transfers, independent scopes, inherited navigation and reorder boundaries | [Drafts](../src/drafts.test.ts)                      |

Shared frame sizing, feedback, scope markers, sanitization, and controls are covered by [settings-menu tests](../../../libs/src/tui/components/settings-menu/index.test.ts), rather than repeated per consumer. Widget tests protect domain navigation, passive previews, and integration with the shared frame.

The [shared interactive host fixture](../../../libs/src/validation/interactive-host/README.md) uses installed Pi registration implementations, `AgentSession`, both renderers, the stable UI proxy, and the native fullscreen dock. This package owns widget scenarios. Temporary settings and offline model runtime are isolated. Tests do not send model requests or add extension-owned transcript entries. Session boundary tests emit native shutdown/start around an in-memory session reset; they do not drive an interactive session picker.

## Terminal checks

Use workspace Pi with this extension and a native widget contributor such as `pi-todo`. No model call is needed for the menu itself.

1. Open `/widgets` in regular and fullscreen modes. Resize while navigating and editing. Verify non-overlay operation, retained selection and drafts, working controls, and editor focus after closing. Previews must use the selected row without creating another live widget instance.
2. Reorder, hide and re-add widgets with **a**. Check empty rows and regions, unavailable saved IDs, and registration changes while editing. New registrations must not retarget the selected widget. Native placement changes must preserve the nested row's identity or return to the row list without applying stale input.
3. Check `/widgets` at 80×24 and 40×10, in dark and light themes. Check active-scope highlighting, unset/dirty markers, path and overflow labels, fixed bounded navigation, and save/exit hints. An unchanged unset-scope save must create that override. Verify independent drafts and one-way project inheritance; a global save must not retarget inherited nested edits. **Reset to defaults** remains staged until Ctrl+S.
4. Hold a settings lock or use malformed JSON; failed saves must retain edits, keep the selected target and recovery visible, and allow Ctrl+S retry. Load/save warnings must not appear as unconditional success or duplicate notifications. Success clears after actual edits or scope changes; fixing and reopening clears load warnings.
5. Exercise `/reload`, new/resumed sessions, and renderer switching. Verify cleanup, registration updates, editor availability, and native mouse interactions.
6. Check both load orders with a separate custom-footer extension. Verify the conflict diagnostic, then disable the competing footer and reload to reacquire ownership.

Automated renderer checks do not establish physical-terminal interaction behavior.
