# Lifecycle coordination

[Library index](../../README.md#usage)

Pi runs session and run handlers in extension load order, so startup side effects, shortcut owners, shutdown races, and run timing can change with that order. `@pi-mono/libs/lifecycle` gives participants a startup barrier, shortcut claims, a shutdown phase, and run marks that give the same result in any load order.

## Behaviour

`joinLifecycle(pi, { id })` returns one participant. Its methods give these results:

| Method                                  | Result                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onSessionStart`, then `arrival.commit` | The startup barrier runs every commit after every extension's `session_start` handler has settled, in ascending rank.                                |
| `onSessionStart`, then `claimShortcut`  | Claims whose keys can match one keypress register for no claimant and give one warning. Every other claim registers through the claimant's own `pi`. |
| `onSessionShutdown(revoke, cleanup)`    | The shutdown phase calls every live participant's `revoke` synchronously before any participant's `cleanup` awaits.                                  |
| `onAgentStart`, `onAgentSettled`        | Each run mark is the earliest `performance.now()` mark that any participant took for that event.                                                     |

Each method registers the participant's own Pi handler through its own `pi`. The module does not see shortcuts that other extensions register directly or Pi's built-in keys, and it cannot remove a shortcut from Pi.

| When you…                                                 | Read                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Choose a commit rank or check which extensions take part  | [Recommended ranks and registrations](phases.md#recommended-ranks-and-registrations) |
| Debug the order of commits, claims, revokes, or run marks | [Lifecycle phases](phases.md)                                                        |
| Check what changes when two library versions meet         | [Version mismatch](phases.md#version-mismatch)                                       |

## Usage

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";

export default function notesExtension(pi: ExtensionAPI) {
  const lifecycle = joinLifecycle(pi, { id: "example-notes" });
  let accepting = true;
  let startedAt: number | undefined;

  lifecycle.onSessionStart((_event, _ctx, arrival) => {
    arrival.claimShortcut("ctrl+alt+n", {
      description: "Add a note",
      handler: (ctx) => {
        if (accepting) ctx.ui.notify("Note added.", "info");
      }
    });
    arrival.commit(300, (ctx) => ctx.ui.notify("Notes are ready.", "info"));
  });
  lifecycle.onSessionShutdown(() => {
    accepting = false;
  });
  lifecycle.onAgentStart((_event, _ctx, at) => {
    startedAt ??= at;
  });
  lifecycle.onAgentSettled((_event, ctx, at) => {
    if (startedAt === undefined || !ctx.isIdle()) return;
    ctx.ui.notify(`The run took ${Math.round(at - startedAt)} ms.`, "info");
    startedAt = undefined;
  });
}
```

## Caller responsibilities

- Join once during the extension factory, with a stable ID such as the package name, and register every lifecycle handler there.
- Keep `revoke` synchronous and short. It must only stop new work; await pending work in `cleanup`.
- Keep shortcut policy, such as defaults and settings, in the extension. Claim only keys that the extension can lose to a conflict.

Related: the [coordinator protocol](../coordination/README.md) owns liveness, order rules, error reports, and disposal for every coordinator.
