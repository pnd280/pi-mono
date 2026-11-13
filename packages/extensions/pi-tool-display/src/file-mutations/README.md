# File mutation observation

[pi-tool-display](../../README.md) · [Recorded data and replay](../../docs/recording.md#observation)

Change cards and saved patches need to know what native `edit` and `write` calls changed on disk, without rereading the targets. [`observeFileMutations`](index.ts) observes verified native `edit` and `write` operations through [`@pi-mono/libs/native-tools`](../../../../libs/src/native-tools/README.md). The [display collectors](../host/collection.ts) subscribe, and [`displayMutationSink`](../observation/native.ts) turns each mutation into display facts.

## Behaviour

- Each mutation reports the `path`, a `sequence` number, `before` and `after` source observations, an `outcome`, and a `patch(limits)` function.
- Subscribers share source capture and patches for each call. Canonical paths resolve symlink aliases.
- Writes take one bounded pre-read inside Pi's mutation queue. There is no post-write read, so `after` excludes later external changes.
- Only attempted disk writes produce mutations. For a failed write, `after` is the proposed content, not confirmed content.
- Completion callbacks settle before the tool returns. Callback failures do not change tool execution or other subscribers.
- Separately loaded copies of pi-tool-display subscribe to one registry under `Symbol.for("pi-mono.file-mutations")` on `AgentSession.prototype`, so `edit` and `write` get one wrapper whatever the number of copies.

| When you…                                                     | Read                                                |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Interpret a source observation, an outcome, or a patch status | [Capture and patches](capture.md)                   |
| Wrap an already verified native definition directly           | [Custom definitions](capture.md#custom-definitions) |

## Usage

```ts
import { observeFileMutations } from "../file-mutations/index.ts";

// During extension loading, before Pi builds the runtime.
const mutations = observeFileMutations({
  eligible: (session) => session.sessionManager === manager,
  begin: () => ({
    maxSourceBytes: 256 * 1024,
    completed: async (mutation) => {
      if (mutation.outcome !== "success") return;
      const patch = await mutation.patch(limits);
      if (patch.status === "ready") record(mutation.path, mutation.sequence, patch.patch);
    }
  })
});

pi.on("session_start", (_event, ctx) => mutations.bind(ctx.sessionManager));
pi.on("session_shutdown", () => mutations.dispose());
```

## Subscriber responsibilities

### Must not break

- Treat mutations and sources as read-only.
- Do not keep `patch` after the completion callback. It holds the source and the cached patches.
- Check `outcome` before you treat `after` as written content.
- Persist the facts that you need, not raw mutations.
- Check lifecycle before you publish work that can outlive sessions.

### Setup

1. Subscribe with `observeFileMutations()` during extension loading, before Pi builds the runtime. Choose eligible sessions and return a `MutationSink` for each call to observe.
2. Once the session is eligible, call `bind(sessionManager)`.
3. Await `patch(limits)` inside the completion callback, and return the callback's promise.
4. Dispose the subscription on shutdown. Disposal stops callbacks to that subscriber, including eligibility and `begin`, without disabling other subscriptions.

### Limits and ordering

- Supply a nonnegative safe integer `maxSourceBytes`. The module does not observe a sink with any other value.
- Capture uses the largest subscriber request, so enforce your own retention and patch limits.
- Source observations require complete, valid UTF-8. Distinguish missing files from unavailable snapshots.
- Use `sequence`, which is assigned just before each disk write, instead of callback order for net comparisons.

Related: patch limits and statuses come from [`@pi-mono/libs/bounded-diff`](../../../../libs/src/bounded-diff/README.md).
