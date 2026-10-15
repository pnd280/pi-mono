# Glossary map

The [workspace architecture](docs/architecture.md) keeps each feature's domain policy in its own package and connects packages through shared contracts. Use these glossaries when changing those contracts.

## Contexts

- [pi-tool-display](./packages/extensions/pi-tool-display/GLOSSARY.md) presents Pi tool calls as cards, exploration groups, and run summaries.
- [pi-nested-instructions](./packages/extensions/pi-nested-instructions/GLOSSARY.md) loads instruction files from directories that tool inputs reach into.
- [pi-agent-summary](./packages/extensions/pi-agent-summary/GLOSSARY.md) times runs and summarises each finished run, including counters and milestones that other extensions report.
- [pi-subagents](./packages/extensions/pi-subagents/GLOSSARY.md) delegates tasks to separate Pi processes, runs background jobs, and returns their results to the supervisor session.

## Relationships

`pi-nested-instructions` publishes notices that `pi-tool-display` renders through its [message adapter](./packages/extensions/pi-tool-display/src/adapters/pi-nested-instructions/README.md). Tool display counts these notices in run summaries: they join the preceding run but remain exploration-group boundaries.

`pi-subagents` owns task and job results; `pi-tool-display` renders them as cards through its [subagent adapter](./packages/extensions/pi-tool-display/src/adapters/pi-subagents/README.md). `pi-subagents` also adds to `pi-agent-summary` counters.
