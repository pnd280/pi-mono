# File mutation observation

[Library index](../../README.md#usage)

Observe what verified native `edit` and `write` calls changed on disk, without rereading targets.

## Behaviour

[`@pi-mono/libs/file-mutations`](index.ts) observes verified native `edit` and `write` operations through [native-tools](../native-tools/README.md). Consumers share source capture and patches for each call.

Writes take a bounded pre-read inside Pi's mutation queue. No post-write read means `after` excludes later external changes. Canonical paths resolve symlink aliases.

Only attempted disk writes produce mutations. Successful disk writes retain success even if Pi cancellation or middleware intervenes later. Failed writes' `after` is proposed, not confirmed content. `durationMs` excludes source capture and patch generation.

`patch(limits)` accepts `PatchLimits` from [bounded-diff](../bounded-diff/README.md). A valid native edit patch can be reused despite source or generation limits, but must fit the requested patch limit.

Completion callbacks run outside Pi's mutation queue and settle before the tool returns. Callback failures do not change tool execution or other observers.

## Caller responsibilities

1. Subscribe with `observeFileMutations()` during extension loading, before Pi builds the runtime. Choose eligible sessions and return a `MutationSink` for each call to observe.
2. Once the session is eligible, call `bind(sessionManager)`.
3. Dispose the subscription on shutdown. Disposal stops notifications to that consumer without disabling other subscriptions.

Supply a nonnegative safe integer `maxSourceBytes`. Capture uses the largest consumer request. Enforce your own retention and patch limits. Source observations require complete, valid UTF-8; distinguish missing files from unavailable snapshots.

Use `sequence`, assigned just before each disk write, rather than callback order for net comparisons. Check `outcome` before treating `after` as written content.

Treat mutations and sources as read-only. Await `patch(limits)` inside completion and return the callback's promise. Never retain `patch` afterward because it holds the source and cached patches. Check lifecycle before publishing work that may outlive sessions. Persist needed facts, not raw mutations.

Use `observeMutationDefinition()` only for an already verified local native definition. Do not apply it to SDK tool overrides or custom tool implementations. Pi's public factories retain control of mutation semantics and queue ordering.

## Validation

Use [package validation](../../README.md#validation). Also run the `pi-agent-summary` and `pi-tool-display` checks and tests after changes.
