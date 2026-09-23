# Pi compatibility

[pi-session-utils](../README.md)

## Contracts to verify

- [ ] [Persistence](../src/persist.ts): `SessionManager.create()` provides a fresh header and path; `getBranch()` preserves active-path order; Pi can reopen the resulting JSONL and continue appending. Preserve any existing `parentSession`.
- [ ] [Commands](../src/commands.ts): `isIdle()` reports active runs and other busy states so commands can reject them immediately; `switchSession()` and `newSession({ parentSession })` supply a fresh `withSession` context and report cancellation before replacement. `newSession()` starts without the parent's conversation or name.
- [ ] [Startup hook](../src/startup.ts): Pi and extension imports share the same `SessionManager` prototype. CLI flag values are unavailable during extension factories. Initial `buildSessionContext()` runs after flags are populated but before JSON headers, extension binding, or prompts. `getHeader()` returns the live, mutable header, and a fresh session file is still unwritten.
- [ ] Pi propagates startup context-construction failures as nonzero exits. The one-shot hook is restored before forwarding or throwing; reload and replacement do not reapply the CLI flag.
- [ ] [Parent lookup](../src/parent.ts): default session groups remain under `getAgentDir()/sessions/`; headers identify exact IDs and session cwd. Lookup must not invoke migration or modify parents.

## Limitations and replacement opportunities

- Pi exposes no public startup parent setter. A narrowly scoped prototype hook and live-header mutation implement the CLI flag. Replace them with a startup session-options API if one becomes available; retain rejection of resumed/nonempty sessions and failure before model requests.
- Pi resolves built-in session-selection options before extensions load. Conflicting options may open or migrate a session, or show the `--resume` picker, before the extension rejects them.
- In-memory managers do not retain the custom directory preference. `/sesh persist` uses the default directory; parent ID lookup can additionally use explicit CLI/environment directory overrides.
- Replace JSONL copying with a public in-memory persistence API if Pi adds one, preserving branch state, lineage, and cancelled-switch cleanup.

## Validation

Run [package checks](../README.md#validation). Installed-process tests cover JSON output, file persistence, exact-ID selection, ephemeral children, reload, subsequent children, and nonzero startup failures. Runtime tests cover public session replacement and cancellation.
