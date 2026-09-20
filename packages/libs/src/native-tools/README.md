# Native tool observation

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/native-tools`](index.ts) shares observation across independently loaded consumers using verified Pi 0.86.1 API/CLI construction hooks. SDK overrides, custom tools, and changed definitions are excluded.

Observers wrap verified definitions before Pi attaches middleware. The registry preserves schemas, prompt metadata, settings, and active tool selection.

Disposal restores unchanged replacements, preserves later wrappers, and makes retained wrappers use the original tool. The last subscriber releases shared hooks.

## Caller responsibilities

1. Subscribe with `observeNativeTools()` during extension loading, before Pi builds the runtime.
2. Once the session is eligible, call `bind(session)` or `bindSessionManager(manager)`.
3. Dispose the subscription on shutdown.

Use `isNative(session, name)` to check whether the current definition is verified, including shared replacements.

Only the first eligible subscriber wraps each tool. Use [file-mutations](../file-mutations/README.md) to combine `edit`/`write` requests. Keep policy, warnings, and persistence local.

Do not mutate borrowed definitions or published results. Do not register additional tools or change active tool selection for observation.

## Validation

Use [package validation](../../README.md#validation). Also run the `pi-agent-summary` and `pi-tool-display` checks and tests after changes. The display [API](../../../extensions/pi-tool-display/src/host/install.test.ts) and [installed-CLI](../../../extensions/pi-tool-display/src/host/install-cli.test.ts) suites check construction verification, middleware, settings, reload, and conditional restoration.
