# [pi-prompt-manager](README.md) development

## Ownership and navigation

- `src/index.ts` is the passive lifecycle adapter; activation and settings/storage access require `ctx.mode === "tui"`.
- `src/manager.ts` owns session expiry, capture FIFO, pending-save/copy guards, restoration revision, UI reservation, and tracked writes. Its ports permit testing without Pi.
- `src/storage/` owns bounded codecs, private descriptor checks, owned locks, atomic replacement, and latest-document mutation. `history.ts` and `drafts.ts` own the different capacity policies.
- `src/browser/controller.ts` owns view/loading/selection/confirmation state; `view.ts` uses Pi's `Input`, `SelectList`, and `DynamicBorder` with injected theme/keybindings to match the settings UI and `/model`-style collection tabs. Keep full-text search and action dispatch in the controller rather than delegating them to native label-only search or settings toggles. `browser/open.ts` owns responsive inline/overlay mounting and post-close editor restoration; `browser/layout.ts` owns the shared height budget and threshold. `search.ts` and `browser/preview.ts` prepare cached display data outside repeated rendering.
- `src/host/` is the only home for private Pi append access and editor normalization/refusal boundaries. Reinspect both the bundled and unbundled append implementation when upgrading Pi. Disposal must disable retained wrappers before conditional restoration.
- `validation/` contains offline host/bundle/editor fixtures, a terminal launcher, and the two-process storage worker. Runtime modules must not import it.

## Constraints

Keep collections and their state local to this extension. Reuse `@pi-mono/utils/terminal-text` for display only; never sanitize stored/copied source or substitute it for restoration refusal. Never use Pi's general clipboard helper, native editor history, user-message APIs, or transcript persistence for feature operations.

Use `ctx.ui.custom` for browser and inspection views. Cap inline height at three quarters of the rows remaining after reserving three for default chrome; below a 12-row budget, use an overlay capped at three quarters of the full terminal height. Resize transitions must preserve the logical view, cancel deletion confirmation, and dispose only the old host adapter. Never close an overlay before Pi mounts it. Do not install a custom editor implementation.

No migrations, aliases, automatic lock stealing, draft eviction, feature network requests, or settings rewrites. Preserve the rename commit point and distinguish post-commit cleanup warnings from failure. Never fall back from UUID/text/timestamp deletion identity to an index or text alone. See [storage invariants](docs/storage.md) and [control semantics](docs/controls.md).

## Validation

Follow the workspace [verification workflow](../../../docs/agents/verification.md), [testing conventions](../../../docs/agents/testing.md), and [package development conventions](../../../docs/development.md). Use `pi-prompt-manager` for scoped checks. Shared sanitizer changes also require `@pi-mono/utils` and `pi-tool-display` checks/tests. Run the [offline fixtures and platform checks](docs/validation.md) for host, terminal, clipboard, or privacy changes; Linux results do not establish macOS or WSL behavior.
