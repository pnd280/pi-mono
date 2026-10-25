# Lifecycle phases and ranks

[Lifecycle coordination](README.md)

Read this when you choose a commit rank, debug startup or shutdown order, or check what changes after a coordinator version mismatch. For liveness, order rules, and disposal, see the [coordinator protocol](../coordination/README.md).

## Startup barrier

1. `onSessionStart` handlers run in load order, as Pi calls them. Each receives an arrival with `commit` and `claimShortcut`.
2. Pi emits `resources_discover` after every `session_start` handler has settled. `onSessionStart` also registers a `resources_discover` handler.
3. The first of these handlers resolves the [shortcut claims](#shortcut-claims) of every live participant and then runs their commits in ascending rank. Pi waits for the commits before it continues.

No participant waits for another, so the barrier cannot deadlock. A commit that throws is [reported](../coordination/README.md#errors), and the next commit runs. Commits and claims made after the participant's handler settled throw. Every bind and `/reload` opens a new barrier, also when Pi emits the same `session_start` event again.

## Shortcut claims

- Each key is normalised with [`canonicalKeySchema`](../tui/keybindings/README.md). An invalid key is not registered, with one warning.
- Claims whose keys can match one keypress, by [`keysOverlap`](../tui/keybindings/README.md), form one conflict. No claimant in a conflict registers its key, and each conflict gives one warning.
- Every other claim registers its canonical key through the claimant's own `pi.registerShortcut`. Pi sets up shortcuts after `resources_discover`, so they work at once.
- A key runs only the handler of the claim that the latest barrier accepted. Pi cannot remove a shortcut, so a key that a later bind drops, puts in a conflict, or accepts from another participant stays registered with its earlier description. The key does nothing while no current claim for it is accepted. When a later bind accepts a claim for it again, from any participant, the key runs that claim's handler.
- Claims do not see shortcuts that other extensions register directly, or Pi's built-in keys. Pi resolves those conflicts.

## Shutdown phase

1. `onSessionShutdown(revoke, cleanup)` stores `revoke` during the factory and registers a `session_shutdown` handler.
2. The first participant handler of a shutdown calls every live participant's `revoke` synchronously, in participant ID order, before it awaits anything.
3. A participant handler whose `revoke` did not run in that call, such as one with a duplicate ID, calls its own `revoke` first.
4. Each participant's handler then awaits its own `cleanup`.
5. A participant's own `revoke` error is thrown from its handler after its `cleanup`, so Pi reports it for that participant. When both fail, the handler throws an `AggregateError`.

## Run marks

`onAgentStart` and `onAgentSettled` take a `performance.now()` mark at the start of each handler, before the handler runs. Every participant receives the earliest mark taken for that event, so a participant's run timing does not depend on slower handlers before it.

## Version mismatch

After a [version mismatch](../coordination/README.md#version-mismatch), each participant changes as follows:

- Its own `resources_discover` handler resolves only its claims and runs only its commits, so commits follow load order.
- Its `session_shutdown` handler calls only its own `revoke`, so a `revoke` can run after another extension's await.
- Its run handlers receive their own marks.

## Recommended ranks and registrations

Each participant states its reasons in its own documentation.

| Participant                                                   | Registration                |
| ------------------------------------------------------------- | --------------------------- |
| pi-nested-instructions                                        | Commit at `100`             |
| pi-profiles                                                   | Commit at `200`             |
| pi-profiles                                                   | Shortcut claim              |
| pi-prompt-manager                                             | Shortcut claims             |
| pi-subagents                                                  | Shortcut claim              |
| pi-session-utils, pi-agent-summary                            | Shutdown revoke             |
| pi-profiles, pi-prompt-manager, pi-subagents, pi-tool-display | Shutdown revoke and cleanup |
| pi-agent-summary                                              | Run marks                   |
| pi-subagents                                                  | Run marks                   |
