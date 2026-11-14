# Native tool observation

[pi-tool-display](../../../README.md)

The display collectors and [file mutation observation](../../file-mutations/README.md) both react to native Pi tools, and would each wrap the same tools if they worked alone. [`observeNativeTools`](index.ts) shares one observation of verified native Pi tool definitions, from both the API and the CLI, across those subscribers.

## Behaviour

Observation excludes SDK overrides, custom tools, and changed definitions. It preserves active tool selection.

### Wrappers and disposal

- Each tool gets at most one wrapper, from the first eligible subscriber that lists its name.
- Subscriptions have independent lifetimes.
- Disposal restores only replacements that this module still owns.
- After their subscriber is disposed, retained wrappers call the original tool.
- A callback that disposes another subscriber prevents later callbacks to that subscriber in the same dispatch.

### Failures

If Pi's construction contract is not recognised, or an observer callback throws, tools keep their original execution and subscribers receive `warning()`.

## Usage

```ts
import { observeNativeTools } from "./native-tools/index.ts";

// During extension loading, before Pi builds the runtime.
const native = observeNativeTools({
  names: ["bash"],
  eligible: (session) => session.sessionManager === manager,
  wrap: (session, original, settings) => ({
    ...original,
    execute(id, params, signal, onUpdate, context) {
      record(id, settings.cwd);
      return original.execute(id, params, signal, onUpdate, context);
    }
  }),
  warning: (message) => console.warn(`my-extension: ${message}`)
});

pi.on("session_start", (_event, ctx) => native.bindSessionManager(ctx.sessionManager));
pi.on("session_shutdown", () => native.dispose());
```

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
- Keep policy, warnings, and persistence in the consumer.

Related: the [display collectors](../collection.ts) observe `bash` and `powershell` through this module, and wrap `edit` and `write` through [file mutation observation](../../file-mutations/README.md).

## Validation

The display [API](../install.test.ts) and [installed-CLI](../install-cli.test.ts) suites exercise integration.
