# File mutation observation

[Library index](../../README.md#usage)

Extensions that summarise or display file changes need to know what native `edit` and `write` calls changed on disk, without rereading the targets. [`@pi-mono/libs/file-mutations`](index.ts) observes verified native `edit` and `write` operations through [native-tools](../native-tools/README.md).

## Behaviour

Consumers share source capture and patches for each call. Canonical paths resolve symlink aliases.

### Source capture

- Writes take a bounded pre-read inside Pi's mutation queue.
- There is no post-write read, so `after` excludes later external changes.
- `before` and `after` are [`FileObservation`](observation.ts) values: complete UTF-8 source or a refusal.
- A `ready` observation holds the whole file and preserves BOMs.
- Invalid UTF-8, nonregular, oversized, changed, missing, and unreadable files return a status without text.
- Source reads follow symlinks without permission repair.
- Source reads refuse nonregular files such as FIFOs without blocking.
- Size and timestamp checks are not atomic snapshots.

### Outcomes

- Only attempted disk writes produce mutations.
- A successful disk write keeps its success outcome even if Pi cancellation or middleware intervenes later.
- For a failed write, `after` is the proposed content, not confirmed content.

### Patches

- `patch(limits)` accepts `PatchLimits` from [bounded-diff](../bounded-diff/README.md) and throws `RangeError` for invalid limits.
- A valid native edit patch can be reused without applying the source or generation limits, but it must fit the requested patch limit.
- Without a native patch, `patch()` returns `source-unavailable` when either observation is neither `ready` nor `missing`.

### Callbacks

Completion callbacks run outside Pi's mutation queue and settle before the tool returns. Callback failures do not change tool execution or other observers.

## Caller responsibilities

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
4. Dispose the subscription on shutdown. Disposal stops callbacks to that consumer, including eligibility and `begin`, without disabling other subscriptions.

### Limits and ordering

- Supply a nonnegative safe integer `maxSourceBytes`. The library does not observe a sink with any other value.
- Capture uses the largest consumer request, so enforce your own retention and patch limits.
- Source observations require complete, valid UTF-8. Distinguish missing files from unavailable snapshots.
- Use `sequence`, which is assigned just before each disk write, instead of callback order for net comparisons.

### Custom definitions

Use `observeMutationDefinition()` only for an already verified local native definition. Do not apply it to SDK tool overrides or custom tool implementations. Pi's public factories keep control of mutation semantics and queue ordering.

## Validation

Use [package validation](../../README.md#validation). Also run the `pi-agent-summary` and `pi-tool-display` checks and tests after changes.
