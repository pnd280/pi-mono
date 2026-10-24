# Profile menu

[pi-profiles](../README.md)

In the interactive terminal, `/profile` opens a menu with two views. Press **Tab** to change the view, and type to search. The details of the selected row show below the list. When the terminal is short, the menu cuts the details and marks the cut with `…`.

The menu shows the state when it opens. In RPC mode, `/profile` shows a plain list of the profiles instead.

## Profiles view

- The "Profiles" view lists the profiles, then `clear`, and marks the current one. Press **Enter** to switch.
- The details show the profile's model, thinking level, tool lists, and appended prompts, and the tool change that a switch would request now. Pi can still leave out an MCP tool that a `--tools` list does not name.
- The details also show when the model is unknown or has no credentials.
- The `defer` list shows each [group](tools.md#groups) in square brackets.

## Tools view

- The "Tools" view lists every registered tool with its state and exposure, and counts the tools in each state.
- The details explain the state, name the selected profile's rule for the tool, and show whether the model called the tool on the current branch. They also show the tool's source and description.
- The details of a tool in a deferred group name the other tools that load with it.

| State        | Meaning                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `active`     | Pi has activated the tool. [Codemode-only mode](tools.md#codemode-only-mode) can still hide its declaration.            |
| `deferred`   | The selected profile deferred the tool. The details tell whether the active `tool_search` can load it.                  |
| `searchable` | The tool is not active. Its exposure is `codemode` or `deferred`, so `tool_search` can load it.                         |
| `off`        | The tool is not active, and `tool_search` cannot load it, also when the profile denies a `codemode` or `deferred` tool. |
| `hidden`     | The tool has `hidden` exposure, so nothing can reach it.                                                                |
