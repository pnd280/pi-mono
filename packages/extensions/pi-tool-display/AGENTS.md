# [pi-tool-display](README.md) development

| When you…                        | Read                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Meet an unfamiliar term          | [GLOSSARY.md](GLOSSARY.md)                                                                 |
| Add or change an adapter         | [Adapters](docs/adapters.md)                                                               |
| Change clicks, keys, or layout   | [Terminal checks](docs/validation.md)                                                      |
| Change what is saved or replayed | [Recorded data and replay](docs/recording.md)                                              |
| Change the diff panel            | [Diff view](src/rendering/diff-view/README.md)                                             |
| Bump the supported Pi version    | [Compatibility](docs/pi-compatibility.md), then the host fixtures in the next row          |
| Update host fixtures             | [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures |

## Constraints

Presentation preserves tool execution and leaves borrowed data unchanged.

### Layers

The transcript owns call state and boundaries. [Display adapters](GLOSSARY.md#interpretation) interpret verified tool contracts, and rendering consumes that interpretation. This keeps presentation failures from changing tool behaviour, and output prose from becoming an operation fact.

When adding a message type or adapting a Pi row, preserve the distinction between [exploration groups and runs](GLOSSARY.md#transcript-structure); see [summary mode](docs/presentation.md#summary-mode).

### Pi host access

- Keep all private Pi access under `host/`.
- Collect in TUI, RPC, print, and JSON sessions. Observe a native tool only when it has a verified native definition and specialised rendering is selected. Collection belongs to the session, not the terminal binding.
- Preserve middleware, settings, active tools, results, and mutation ordering, so other consumers of [native tools](../../libs/src/native-tools/README.md) and [file mutations](../../libs/src/file-mutations/README.md) see no change.
- Present through hooks and renderers. Never register tools for presentation, and never recreate closures that you did not create.
- Restore only hooks and definitions this extension installed, and keep wrappers added after it.
- Bind callbacks and pending events to the current binding, so that disposed ones never reattach old hooks.

### Borrowed data

- Treat Pi's tool arguments and results as borrowed: read them only.
- Interpret a call only from [verified provenance](docs/adapters.md#recognise-tool-contracts), never by guessing from output text.
- Display code (adapter lookup and renderers) must not take the [prohibited adapter actions](docs/adapters.md#prohibited-actions).
- Persist only bounded facts and patches, never result bodies, images, or styled text.
- Replay must not observe files again, rerun tools, or animate results whose outcome is unknown.

### Rows

Grouped calls and notices stay in their original Pi rows. Change [row chrome](GLOSSARY.md#transcript-structure) only in `layoutRow`, which owns rendering and click targets. Keep diagnostics and images attached to their source call, following the [mode visibility rules](README.md#usage).
