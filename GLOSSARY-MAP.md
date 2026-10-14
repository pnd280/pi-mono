# Glossary map

The [workspace architecture](docs/architecture.md) assigns discovery and presentation to separate packages. Use these glossaries when changing their shared contracts.

## Contexts

- [pi-tool-display](./packages/extensions/pi-tool-display/GLOSSARY.md) presents Pi tool calls as cards, exploration groups, and run summaries.
- [pi-nested-instructions](./packages/extensions/pi-nested-instructions/GLOSSARY.md) loads instruction files from directories that tool inputs reach into.

## Relationships

`pi-nested-instructions` publishes notices that `pi-tool-display` renders through its [message adapter](./packages/extensions/pi-tool-display/src/adapters/pi-nested-instructions/README.md). Tool display counts these notices in run summaries: they join the preceding run but remain exploration-group boundaries.
