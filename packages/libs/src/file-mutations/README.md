# File mutation observation

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/file-mutations`](index.ts) observes verified native `edit` and `write` operations through [native-tools](../native-tools/README.md). Consumers share source capture and patches for each call.

Edits reuse native reads/written content; writes add one bounded pre-read inside Pi's mutation queue. No post-write read means `after` excludes subsequent external changes. Canonical paths resolve symlink aliases, including new descendants.

Only attempted disk writes produce mutations. Successful disk writes retain success despite later Pi cancellation/middleware. Failed writes' `after` is proposed, not confirmed content. `durationMs` excludes source capture and patch generation.

`patch(limits)` reuses a valid native edit patch or generates a patch through [bounded-diff](../bounded-diff/README.md). Requests with identical limits share a promise. Native patches bypass source and diff-generation limits but must fit the requested patch limit.

Completion callbacks run outside Pi's mutation queue and settle before the tool returns. Exceptions and rejected callbacks do not affect tool execution or other observers.

## Caller responsibilities

1. Subscribe with `observeFileMutations()` during extension loading, before Pi builds the runtime. Choose eligible sessions and return a `MutationSink` for each call to observe.
2. Once the session is eligible, call `bind(sessionManager)`.
3. Dispose the subscription on shutdown. Disposal stops notifications to that consumer without disabling other subscriptions.

Supply a nonnegative safe integer `maxSourceBytes`. Source capture uses the largest request among the call's consumers. Enforce your own retained-memory and patch limits. Source observations require complete, valid UTF-8. A missing file is distinct from an unreadable, oversized, or unstable snapshot.

Use `sequence`, assigned just before each disk write, rather than callback order for net comparisons. Check `outcome` before treating `after` as written content.

Treat mutations/sources as read-only. Await `patch(limits)` inside completion and return the callback's promise; never retain `patch` afterward because it retains source/cached patches. Check lifecycle before publishing work that may outlive sessions. Persist needed facts, not raw mutations.

Use `observeMutationDefinition()` only for an already verified local native definition. Do not apply it to SDK tool overrides or custom tool implementations. Pi's public factories retain control of mutation semantics and queue ordering.

## Validation

Use [package validation](../../README.md#validation). Also run the `pi-agent-summary` and `pi-tool-display` checks and tests after changes.
