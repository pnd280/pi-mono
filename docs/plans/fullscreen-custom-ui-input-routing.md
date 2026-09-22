# Fullscreen custom UI input-routing plan

[Workspace architecture](../architecture.md) · [Shared custom UI](../../packages/libs/src/tui/responsive-custom-ui/README.md)

## Goal

Route configured paging to focused fullscreen inline views without scrolling the transcript. Keep the adapter in `@pi-mono/libs`, with no extension-local patches, Pi core changes, or global keybinding changes.

| Consumer                                                                                                 | Mounting                                              | Paging                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| [Todo browser](../../packages/extensions/pi-todo/src/commands.ts)                                        | Non-overlay in fullscreen; responsive in regular mode | Lists and details               |
| [Shared browser](../../packages/libs/src/tui/open-browser/index.ts), used by prompt-manager              | Inline when tall enough; overlay on short terminals   | Lists, previews, and inspection |
| [Working-message menu](../../packages/libs/src/working-message/index.ts), used by todo and agent-summary | Always non-overlay                                    | No opt-in; the menu uses arrows |

Preserve these mounting policies. Unsupported routing must not force overlays or change settings.

## Host behavior without the adapter

In Pi 0.87.0, `TuiAltScreen` registers its viewport listener during construction. `TuiBase.handleTerminalInput()` traverses the private `inputListeners` Set before delivering input to the focused component; `{ consume: true }` stops dispatch. Public terminal listeners append after viewport handling, too late to recover consumed paging keys.

The extension receives a stable TUI proxy whose property reads forward to the current renderer. Descriptor replacements may target the proxy instead. The [property-hook helper](../../packages/libs/src/owned-hooks/README.md) therefore cannot supply the required listener ordering.

## Component contract

Use the [shared ownership contract](../../packages/libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership): components declare input ownership; host mounting handles priority and lifetime.

- Claim only paging actions resolved by the same injected keybindings and precedence as dispatch and hints. Disabled bindings and keys assigned to higher-priority actions must not be claimed.
- Reserve paging even at scroll boundaries or while navigation is temporarily ignored. Releases must not navigate; repeats must dispatch once.
- Leave unclaimed input on the original host path. Components must not register listeners or mutate host input state.
- Require a consumer-supplied `onInputRoutingUnavailable` callback when opting in. Report once per opening and leave ordinary navigation available.

## Adapter constraints

Keep private access in [fullscreen-input.ts](../../packages/libs/src/tui/responsive-custom-ui/fullscreen-input.ts), with no new package export or dependency. The [host compatibility contract](../../packages/libs/src/tui/responsive-custom-ui/README.md#host-compatibility) defines the supported listener and focus capabilities.

1. Install one dispatcher per listener collection, not per stable proxy. Defer installation to a microtask: reordering a Set during traversal can revisit listeners and duplicate input. Recheck renderer identity and presentation lifetime before installation.
2. Insert the dispatcher first without replacing the collection or changing existing listeners' relative order. Do not identify Pi's viewport listener by inspecting its function source.
3. Route only to a mounted, active, focused fullscreen inline presentation that is not awaiting remount. Respect deferred overlay-focus restoration. Track presentation focus even when the logical component does not implement `Focusable`.
4. Deliver owned input once through the presentation adapter and consume it. Other extension listeners will not observe it; do not replay listeners manually.
5. Deactivate synchronously before closure, cancellation, disposal, or remount can restore another component's focus. Pending installation and retained callbacks must become inert. Reconcile renderer identity during focus and layout updates.
6. Remove only owned registrations and dispatchers, preserving listeners added or removed while the view was open. Preserve one-time logical disposal, widget suppression release, and editor restoration before browser `afterClose` effects.
7. On missing capabilities or detected interference, stop priority routing and report the limitation. Do not compete with another extension for first position or add another private fallback.

Replace the adapter when a public Pi API provides equivalent focus-scoped input priority.

## Verification

Direct `handleInput()` tests verify component policy but cannot establish terminal routing. Drive a real `TuiAltScreen` through its captured terminal callback, with enough transcript and view content to distinguish their movement.

| Boundary                | Required assertions                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paging                  | Default and remapped paging move only the focused list, detail, preview, or inspection once. After closure, transcript paging resumes.                                               |
| Bindings                | Disabled and overridden paging bindings are not claimed; dispatch and hints agree. Releases do not navigate; repeats do not double-dispatch.                                         |
| Ordinary routing        | Regular mode, overlays, working-message menus, and components without claims do not acquire priority routing. Unclaimed events retain listener order.                                |
| Focus                   | Competing custom UI and transcript search receive their own input; returning focus restores ownership. Closed or unfocused views receive no priority delivery.                       |
| Lifetime                | Abort before creation, before installation, while open, and during remount; factory rejection, normal closure, session shutdown, and repeated opening leave no active registrations. |
| Listeners and renderers | Unrelated listener edits survive cleanup. Opening during dispatch does not repeat traversal. Renderer replacement, mode changes, and resizing leave old callbacks inert.             |
| Unsupported hosts       | One diagnostic is delivered without closing the view or installing an unsafe hook; ordinary navigation and cleanup still work.                                                       |
| Consumer effects        | Todo widget suppression releases once. Prompt restoration follows final inline closure, without submission or duplicate `afterClose` calls.                                          |

Keep routing and lifecycle tests in libs, browser interaction tests in the shared browser, and todo ownership/widget tests in pi-todo. Prompt-manager must not duplicate shared browser coverage.

Run the [focused package checks](../development.md#focused-validation), both `check` and `test`, for `@pi-mono/libs`, `pi-todo`, `pi-prompt-manager`, and `pi-agent-summary`.

Use the isolated offline launchers and scenarios in [todo validation](../../packages/extensions/pi-todo/README.md#validation) and [prompt-manager validation](../../packages/extensions/pi-prompt-manager/docs/validation.md#terminal-launcher). Check:

- Regular and fullscreen modes at normal, narrow, and short sizes. Cross the shared browser's 19/18-row inline/overlay boundary both ways; fullscreen `/todos` must remain non-overlay.
- Default/remapped paging, scroll boundaries, transcript search, and focus restoration.
- Repeated closure, reload, and new sessions; restored transcript paging, editor focus/content, and todo widgets.
- Prompt restoration without submission, and unchanged working-message menu navigation.

## Risks and completion criteria

The adapter changes the current renderer's shared input priority. Focus mistakes, stale callbacks, or listener interference can affect other extensions in the same Pi process. Pi upgrades can disable the private contract; arbitrary third-party input patches remain unsupported. Routing itself does not write files or settings or make network requests.

Completion requires passing host-routing regressions and installed-CLI checks for both paging consumers, preserved ordinary routing for other views, listener-preserving cleanup, and a diagnostic when routing is unavailable.
