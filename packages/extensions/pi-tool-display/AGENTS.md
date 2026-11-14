# [pi-tool-display](README.md) development

| When you…                        | Read                                           |
| -------------------------------- | ---------------------------------------------- |
| Add or change an adapter         | [Adapters](docs/adapters.md)                   |
| Change what is saved or replayed | [Recorded data and replay](docs/recording.md)  |
| Change the diff panel            | [Diff view](src/rendering/diff-view/README.md) |

## Constraints

Presentation preserves tool execution and leaves borrowed data unchanged.

### Layers

The transcript owns call state and boundaries. [Display adapters](GLOSSARY.md#interpretation) interpret verified tool contracts, and rendering consumes that interpretation. This keeps presentation failures from changing tool behaviour, and output prose from becoming an operation fact.

When adding a message type or adapting a Pi row, preserve the distinction between [exploration groups and runs](GLOSSARY.md#transcript-structure); see [summary mode](docs/presentation.md#summary-mode).

### Pi host access

- Keep all private Pi access under `host/`.
- Collection belongs to the session, not the terminal binding.
- Preserve mutation ordering, so other consumers of [native tools](src/host/native-tools/README.md) and [file mutations](src/file-mutations/README.md) see no change.
- Present through hooks and renderers, and never recreate closures that you did not create.
- Bind callbacks and pending events to the current binding, so that disposed ones never reattach old hooks.

### Borrowed data

- Interpret a call only from [verified provenance](docs/adapters.md#recognise-tool-contracts), never by guessing from output text.
- Display code (adapter lookup and renderers) must not take the [prohibited adapter actions](docs/adapters.md#prohibited-actions).
- Replay must not animate results whose outcome is unknown.

### Rows

Grouped calls and notices stay in their original Pi rows. Change [row chrome](GLOSSARY.md#transcript-structure) only in `layoutRow`, which owns rendering and click targets. Keep diagnostics and images attached to their source call, following the [mode visibility rules](README.md#usage).
