# [pi-tool-display](README.md) development

| When you…                      | Read                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| meet an unfamiliar term        | [GLOSSARY.md](GLOSSARY.md)                                                                 |
| add or change an adapter       | [Adapters](docs/adapters.md)                                                               |
| change clicks, keys, or layout | [Terminal checks](docs/validation.md)                                                      |
| bump the supported Pi version  | [Compatibility](docs/pi-compatibility.md), then update both host fixtures below.           |
| update host fixtures           | [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures |

## Constraints

Presentation must preserve tool execution and keep borrowed data unchanged.

### Layers

The transcript owns call state and boundaries. Adapters interpret verified tool contracts, and rendering consumes that interpretation. This layering keeps a presentation failure from changing tool behaviour, and keeps output prose from being treated as an operation fact.

When you add a message type or adapt a Pi row, keep the difference between an exploration group and a [run](GLOSSARY.md#transcript-structure) intact; see [summary mode](docs/presentation.md#summary-mode).

### Pi host access

- Keep all private Pi access under `host/`.
- Collect in TUI, RPC, print, and JSON sessions. Observe a native tool only when it has a verified native definition and specialised rendering is selected. Collection belongs to the session, not the terminal binding.
- Preserve middleware, settings, active tools, results, and mutation ordering, so other consumers of [native tools](../../libs/src/native-tools/README.md) and [file mutations](../../libs/src/file-mutations/README.md) see no change.
- Never register tools for presentation, and never recreate closures you did not create.
- Restore only hooks and definitions this extension installed, and keep wrappers added after it.
- Disposed callbacks and pending events must not reattach old hooks.

### Borrowed data

- Treat Pi's tool arguments and results as borrowed: read them, never modify them.
- Interpret a call only from [verified provenance](docs/adapters.md#recognise-tool-contracts), never by guessing from output text.
- Display code (adapter lookup and renderers) must not read files, run tools, or persist data.
- Persist bounded facts and patches.
- Never persist result bodies, images, or styled text.
- Replay must not observe files again, rerun tools, or animate results whose outcome is unknown.

### Rows

Grouped calls and notices stay in their original Pi rows. Change row chrome only in `layoutRow`, which owns both rendering and click targets. Keep diagnostics and images attached to their source call, following the [mode visibility rules](README.md#usage).

User-visible exclusions, side effects, and limits are listed under [what is recorded](README.md#what-is-recorded).
