# Workspace architecture

| Package                                                                   | Responsibility                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`pi-tool-display`](../packages/extensions/pi-tool-display/README.md)     | Tool cards, exploration groups, and bounded display observations.      |
| [`pi-fff-guard`](../packages/extensions/pi-fff-guard/README.md)           | Reject missing or Git-ignored explicit FFF targets.                    |
| [`pi-prompt-manager`](../packages/extensions/pi-prompt-manager/README.md) | Private directory-scoped history, saved drafts, and their TUI browser. |
| [`@pi-mono/utils`](../packages/utils/README.md)                           | Pure FFF classification and terminal-safe plain-text normalization.    |

Shared classification and terminal-text normalization do not own extension state or filesystem policy. See [ownership and reuse](agents/architecture.md) for extraction criteria.

## [Tool display](../packages/extensions/pi-tool-display/AGENTS.md#code-navigation)

### State and dependencies

Each interactive host has its own `DisplaySession` and `TranscriptRows` binding. Private Pi access, provenance checks, registry replacements, and conditional hook restoration remain under `host/`.

`TranscriptCoordinator` is the only writer of call state. It owns ordering, lifecycle, groups, expansion, revisions, row invalidation, and one animation scheduler. Other modules receive read-only call and group views. Pi arguments and published results remain borrowed authoritative data, not mutable extension-owned copies.

`DisplaySession` coordinates history, observations, and persistence, and owns saved-output eligibility and retry independently of attached rows. Disposal disables retained observation callbacks and late preview completions. `TranscriptRows` attaches Pi rows to coordinator invalidation and expansion, keeping images and mouse coordinates in their owning rows.

Rendering consumes transcript contracts: read-only state and an expansion action. The card module owns one lazy row projection and its cache validity across Pi's call and result slots; formatters consume read-only prepared data. Adapters interpret retained tool data without importing card layout or runtime integration.

The root [lint configuration](../vite.config.ts) checks both cross-package imports and internal layers. It rejects rendering dependencies on host, transcript, or observation implementations; reverse dependencies from lower layers into host or rendering; and runtime imports of tests or validation fixtures. Presentation and contract modules cannot import filesystem, subprocess, or network backends.

### Live calls and history

- **Live:** host events update the transcript. Verified native operations publish bounded facts and previews. The session controller persists eligible facts separately from model context; observation failures do not change tool results.
- **History:** the controller reconstructs calls from retained messages and facts on the selected ancestry. Late tool registration can improve adapter selection without rerunning tools. Historical reconstruction does not inspect current project files or animate missing results.
- **Expansion:** the coordinator updates a call or group, synchronizes attached rows, and notifies the session. The session may load a [bounded saved-output preview](../packages/extensions/pi-tool-display/README.md#observation-and-saved-history) for a completed shell call; renderers never initiate reads.

### Public integration

`pi-tool-display/renderers` exposes the standalone renderer factory and its options. `pi-tool-display/adapters` exposes adapter factories and contracts. Automatic adapter selection is internal host policy, not part of the owner-facing API. See [renderer integration](../packages/extensions/pi-tool-display/docs/renderers.md) and [adapter development](../packages/extensions/pi-tool-display/docs/adapters.md).

## [FFF guard](../packages/extensions/pi-fff-guard/AGENTS.md#code-navigation)

The Pi entry point checks tool ownership on every invocation, blocks rejected calls, and delivers diagnostics. Search-scope resolution, missing-path validation, Git-ignore checks, and the inspection deadline remain independent of the Pi session. Neither extension imports the other's policy.

## [Prompt manager](../packages/extensions/pi-prompt-manager/AGENTS.md#ownership-and-navigation)

The package-root wrapper loads a passive factory. Only TUI `session_start` reads the designated global configuration and installs commands, shortcuts, and optional custom-message append observation. `PromptManager` owns one active-session token, capture FIFO, editor-save/restoration guards, clipboard cancellation, UI reservation, and started atomic writes.

History and drafts share a local repository protocol but retain separate files, locks, policies, and failure states. Canonical working-directory identity isolates collections. Mutations read the latest bounded document under an owned cross-process lock; private temporary-file rename is the commit point. Reads do not lock or wait for capture. Occurrence UUID/text/timestamp checks protect deletion from concurrent inserts or changed targets.

Browser state is independent of rendering and persistence. Snapshot-derived sanitized display/search data stays separate from exact stored source. `@pi-mono/utils/terminal-text` owns the extracted `displayText` helper, also consumed by tool display; styled tool-output handling remains local to `pi-tool-display`. Unsafe restoration refusal is a distinct host boundary. Native clipboard subprocesses are extension-owned, asynchronous, and cancellable, with no OSC 52 fallback. Prompt-manager browsing never adds model context or persistent transcript copies.
