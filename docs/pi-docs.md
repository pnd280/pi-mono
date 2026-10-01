# Pi API references

[Workspace development](development.md#pi-apis)

Agents and maintainers checking Pi contracts should use the workspace's installed documentation below. For installed-CLI behaviour, also check the documentation and examples shipped with that CLI if its version differs.

| When you…                                       | Read                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Need the host overview                          | [Main documentation](../node_modules/@earendil-works/pi-coding-agent/README.md)                                                                                                 |
| Register tools, commands, or lifecycle handlers | [Extensions](../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md) and [extension examples](../node_modules/@earendil-works/pi-coding-agent/examples/extensions/) |
| Build a terminal view                           | [TUI components](../node_modules/@earendil-works/pi-coding-agent/docs/tui.md)                                                                                                   |
| Apply theme tokens                              | [Themes](../node_modules/@earendil-works/pi-coding-agent/docs/themes.md)                                                                                                        |
| Discover or expand skills                       | [Skills](../node_modules/@earendil-works/pi-coding-agent/docs/skills.md)                                                                                                        |
| Expand prompt templates                         | [Prompt templates](../node_modules/@earendil-works/pi-coding-agent/docs/prompt-templates.md)                                                                                    |
| Resolve keyboard controls                       | [Keybindings](../node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md)                                                                                              |
| Create a session programmatically               | [SDK integration](../node_modules/@earendil-works/pi-coding-agent/docs/sdk.md) and [SDK examples](../node_modules/@earendil-works/pi-coding-agent/examples/sdk/)                |
| Register a provider                             | [Custom providers](../node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md)                                                                                     |
| Configure model definitions                     | [Adding models](../node_modules/@earendil-works/pi-coding-agent/docs/models.md)                                                                                                 |
| Edit manifests or host dependencies             | [Packages](../node_modules/@earendil-works/pi-coding-agent/docs/packages.md)                                                                                                    |
| Configure Pi through the environment            | [Environment variables](../node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md)                                                                          |
| Connect MCP tools                               | [MCP servers](../node_modules/@earendil-works/pi-coding-agent/docs/mcp.md)                                                                                                      |

When changing a Pi integration, read the relevant installed API documentation and examples, including linked contracts needed by the change. Resolve links inside installed documentation relative to that document, not the workspace root.

## Linking Pi documentation

Only agent docs (`AGENTS.md`, `docs/agents/`, and this page) link the installed copies under `node_modules`, which match the workspace's Pi version. Docs for people, such as READMEs and user guides, link the published pages at `https://pi.dev/docs/latest/<page>`, because `node_modules` doesn't exist on GitHub or before setup.

Published `latest` pages can describe a newer Pi version than the workspace pins. Check the installed references before applying a published API contract to this checkout.
