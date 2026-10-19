# Native tool observation

[Library index](../../README.md#usage)

Independently loaded extensions that react to native Pi tools would each wrap the same tools if they worked alone. [`@pi-mono/libs/native-tools`](index.ts) shares one observation of verified native Pi tool definitions, from both the API and the CLI, across those consumers.

## Behaviour

Observation excludes SDK overrides, custom tools, and changed definitions. It preserves active tool selection.

### Wrappers and disposal

- Each tool gets at most one wrapper, from the first eligible subscriber that lists its name.
- Subscriptions have independent lifetimes.
- Disposal restores only replacements that this library still owns.
- After their subscriber is disposed, retained wrappers call the original tool.
- A callback that disposes another subscriber prevents later callbacks to that subscriber in the same dispatch.

### Failures

If Pi's construction contract is not recognised, or an observer callback throws, tools keep their original execution and subscribers receive `warning()`.

## Caller responsibilities

### Must not break

- Do not mutate borrowed definitions or published results.
- Do not register additional tools or change active tool selection for observation.

### Setup

1. Subscribe with `observeNativeTools()` during extension loading, before Pi builds the runtime.
2. Once the session is eligible, call `bind(session)` or `bindSessionManager(manager)`.
3. Dispose the subscription on shutdown.

### Checks and scope

- Use `isNative(session, name, tool?)` to check whether the current definition is verified, including shared replacements. Pass `tool` when you already hold the name's `ToolInfo`. Otherwise the check reads `session.getAllTools()`, which builds info for every tool.
- Use [file-mutations](../file-mutations/README.md) to combine `edit` and `write` requests.
- Keep policy, warnings, and persistence in the consumer.

## Validation

Use [package validation](../../README.md#validation), then check and test `pi-agent-summary` and `pi-tool-display`. The display [API](../../../extensions/pi-tool-display/src/host/install.test.ts) and [installed-CLI](../../../extensions/pi-tool-display/src/host/install-cli.test.ts) suites exercise integration.
