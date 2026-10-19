# [pi-tool-display](README.md) development

| When you…                        | Read                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| meet an unfamiliar term          | [GLOSSARY.md](GLOSSARY.md)                                                                 |
| add or change an adapter         | [Adapters](docs/adapters.md)                                                               |
| change clicks, keys, or layout   | [Terminal checks](docs/validation.md)                                                      |
| change what is saved or replayed | [Recorded data and replay](docs/recording.md)                                              |
| bump the supported Pi version    | [Compatibility](docs/pi-compatibility.md), then update both host fixtures below.           |
| update host fixtures             | [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures |

## Constraints

Presentation must preserve tool execution and keep borrowed data unchanged.

### Layers

The transcript owns call state and boundaries. [Display adapters](GLOSSARY.md#interpretation) interpret verified tool contracts, and rendering consumes that interpretation. This keeps presentation failures from changing tool behaviour, and output prose from becoming an operation fact.

When adding a message type or adapting a Pi row, preserve the distinction between [exploration groups and runs](GLOSSARY.md#transcript-structure); see [summary mode](docs/presentation.md#summary-mode).

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
- Display code (adapter lookup and renderers) must not take the [prohibited adapter actions](docs/adapters.md#prohibited-actions).
- Persist bounded facts and patches.
- Never persist result bodies, images, or styled text.
- Replay must not observe files again, rerun tools, or animate results whose outcome is unknown.

### Rows

Grouped calls and notices stay in their original Pi rows. Change [row chrome](GLOSSARY.md#transcript-structure) only in `layoutRow`, which owns rendering and click targets. Keep diagnostics and images attached to their source call, following the [mode visibility rules](README.md#usage).

See [what is recorded](README.md#what-is-recorded) for exclusions, side effects, and limits.
