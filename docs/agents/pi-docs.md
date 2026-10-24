# Pi API references

[Pi API contracts](pi-apis.md)

Check Pi contracts against the installed documentation below, which matches the workspace's Pi version. When the installed CLI has a different version, also check the documentation and examples shipped with that CLI for its behaviour.

| When you…                                       | Read                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Need the host overview                          | [Main documentation](../../node_modules/@earendil-works/pi-coding-agent/README.md)                                                                                                    |
| Register tools, commands, or lifecycle handlers | [Extensions](../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md) and [extension examples](../../node_modules/@earendil-works/pi-coding-agent/examples/extensions/) |
| Build a terminal view                           | [TUI components](../../node_modules/@earendil-works/pi-coding-agent/docs/tui.md)                                                                                                      |
| Apply theme tokens                              | [Themes](../../node_modules/@earendil-works/pi-coding-agent/docs/themes.md)                                                                                                           |
| Discover or expand skills                       | [Skills](../../node_modules/@earendil-works/pi-coding-agent/docs/skills.md)                                                                                                           |
| Expand prompt templates                         | [Prompt templates](../../node_modules/@earendil-works/pi-coding-agent/docs/prompt-templates.md)                                                                                       |
| Resolve keyboard controls                       | [Keybindings](../../node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md)                                                                                                 |
| Create a session programmatically               | [SDK integration](../../node_modules/@earendil-works/pi-coding-agent/docs/sdk.md) and [SDK examples](../../node_modules/@earendil-works/pi-coding-agent/examples/sdk/)                |
| Register a provider                             | [Custom providers](../../node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md)                                                                                        |
| Configure model definitions                     | [Adding models](../../node_modules/@earendil-works/pi-coding-agent/docs/models.md)                                                                                                    |
| Edit manifests or host dependencies             | [Packages](../../node_modules/@earendil-works/pi-coding-agent/docs/packages.md)                                                                                                       |
| Configure Pi through the environment            | [Environment variables](../../node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md)                                                                             |
| Connect MCP tools                               | [MCP servers](../../node_modules/@earendil-works/pi-coding-agent/docs/mcp.md)                                                                                                         |
| Drive Pi as an RPC subprocess                   | [RPC mode](../../node_modules/@earendil-works/pi-coding-agent/docs/rpc.md) and [RPC commands](../../node_modules/@earendil-works/pi-coding-agent/docs/rpc-commands.md)                |
| Forward extension UI over RPC                   | [RPC extension UI](../../node_modules/@earendil-works/pi-coding-agent/docs/rpc-extension-ui.md)                                                                                       |
| Read session entries, branches, or leaves       | [Session file format](../../node_modules/@earendil-works/pi-coding-agent/docs/session-format.md)                                                                                      |
| Check a field the docs don't cover              | [Extension types](../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts) and [pi-ai types](../../node_modules/@earendil-works/pi-ai/dist/types.d.ts)     |
| Check runtime order that no doc or type states  | The [compiled core](../../node_modules/@earendil-works/pi-coding-agent/dist/core/), as described below the table                                                                      |

Follow links in installed documentation to the contracts that the change needs, and resolve them relative to that document, not the workspace root. The Markdown docs omit some contracts, such as `ToolDefinition.constrainedSampling` for grammar tools, so read the type declarations before you state that Pi lacks a capability.

In the compiled core, `extensions/runner.js` emits events in load order and ends a `session_before_*` event at the first cancel. `agent-session.js` and `agent-session-runtime.js` run prompts, commands, and session changes.

## Linking Pi documentation

Only agent docs (`AGENTS.md` and `docs/agents/`) link the installed copies under `node_modules`, which match the workspace's Pi version. Docs for people, such as READMEs and user guides, link the published pages at `https://pi.dev/docs/latest/<page>`, because `node_modules` doesn't exist on GitHub or before setup.

Published `latest` pages can describe a newer Pi version than the workspace pins. Check the installed references before applying a published API contract to this checkout.
