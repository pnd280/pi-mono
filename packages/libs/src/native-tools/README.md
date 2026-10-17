# Native tool observation

[Library index](../../README.md#usage)

React to native tool definitions from one shared observation instead of each consumer wrapping tools separately.

## Behaviour

[`@pi-mono/libs/native-tools`](index.ts) shares observation of verified native Pi tool definitions, from both the API and the CLI, across independently loaded consumers. SDK overrides, custom tools, and changed definitions are excluded.

Each tool gets at most one wrapper, from the first eligible subscriber that lists its name. Observation preserves active tool selection. Disposal restores only replacements still owned by this library. After their subscriber is disposed, retained wrappers call the original tool. A callback that disposes another subscriber prevents later callbacks to that subscriber in the same dispatch. Subscriptions have independent lifetimes.

If Pi's construction contract is not recognised, or an observer callback throws, tools keep their original execution and subscribers receive `warning()`.

## Caller responsibilities

1. Subscribe with `observeNativeTools()` during extension loading, before Pi builds the runtime.
2. Once the session is eligible, call `bind(session)` or `bindSessionManager(manager)`.
3. Dispose the subscription on shutdown.

Use `isNative(session, name, tool?)` to check whether the current definition is verified, including shared replacements. Pass `tool` when you already hold the name's `ToolInfo`; otherwise the check reads `session.getAllTools()`, which builds info for every tool.

Use [file-mutations](../file-mutations/README.md) to combine `edit`/`write` requests. Keep policy, warnings, and persistence local.

Do not mutate borrowed definitions or published results. Do not register additional tools or change active tool selection for observation.

## Validation

Use [package validation](../../README.md#validation), then check and test `pi-agent-summary` and `pi-tool-display`. The display [API](../../../extensions/pi-tool-display/src/host/install.test.ts) and [installed-CLI](../../../extensions/pi-tool-display/src/host/install-cli.test.ts) suites exercise integration.
