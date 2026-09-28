# Pi compatibility

[pi-session-utils](../README.md)

## Contracts to verify

- [ ] [Persistence](../src/persist.ts): `SessionManager.create()` provides a fresh header and path; `getBranch()` preserves active-path order; Pi can reopen the resulting JSONL and continue appending. `getSessionName()` reads the latest session-wide metadata, including explicit clearing, independently of the active branch. Preserve that name and any existing `parentSession`.
- [ ] [Commands](../src/commands.ts): `isIdle()` reports active runs and other busy states so persistence and child creation can reject them immediately. Naming remains independent of idle checks and session-operation locking. `switchSession()` and `newSession({ parentSession })` supply a fresh `withSession` context and report cancellation before replacement. `newSession()` omits the parent's conversation and name.
- [ ] [Startup hook](../src/startup.ts): Pi and extension imports share the `SessionManager` prototype. CLI flag values are unavailable during extension factories. Initial `buildSessionContext()` runs after flags are populated but before JSON headers, extension binding, or prompts. `getHeader()` returns the live, mutable header before a fresh session file is written.
- [ ] Pi propagates startup context-construction failures as nonzero exits. The one-shot hook is restored before forwarding or throwing; reload and replacement do not reapply the CLI flag.
- [ ] [Parent lookup](../src/parent.ts): default session groups remain under `getAgentDir()/sessions/`; headers identify exact IDs and session cwd. Lookup must not invoke migration or modify parents.
- [ ] [Generation](../src/auto-title/generate.ts): registry normalization, authentication, supported thinking, complete responses, safe errors, and bounded request/cache defaults; preserve configured-model validation, no fallback, and no retries.
- [ ] [Naming lifecycle](../src/auto-title/runtime.ts): one automatic attempt, branch/session/reload cancellation, manual/external name changes, and stale-result rejection.
- [ ] [Naming adapter](../src/auto-title/index.ts): naming events and metadata-only updates in TUI, print, JSON, and RPC; no conversation messages or custom stdout. Persistence/child creation replace sessions without leaking old naming callbacks.

## Limitations and replacement opportunities

- Pi has no public startup parent setter. A scoped prototype hook and live-header mutation implement the CLI flag. If Pi adds a startup session-options API, replace them while retaining rejection of resumed or nonempty sessions and failure before model requests.
- Pi resolves built-in session-selection options before extensions load. Conflicting options may open or migrate a session, or show the `--resume` picker, before the extension rejects them.
- In-memory managers do not retain the custom directory preference. `/sesh persist` uses the default directory; parent ID lookup can additionally use explicit CLI/environment directory overrides.
- Replace JSONL copying with a public in-memory persistence API if Pi adds one, preserving branch state, the current session-wide name, lineage, and cancelled-switch cleanup.
- [Authentication and providers may ignore cancellation](../src/auto-title/generate.ts). Revisit request cancellation before simplifying the outer deadline; retain bounded waiting and stale-result protection.
- Compare new naming APIs with [source selection and naming policy](../README.md#automatic-session-names). Adoption must preserve text limits, explicit model choice, and request side effects.

## Validation

Run [package checks](../README.md#validation). The [coverage specification](testing.md) defines unit, runtime, and installed-process checks for startup hooks, session replacement, naming, and clean protocol output. Model requests use offline fixture providers.
