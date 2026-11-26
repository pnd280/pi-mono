# Profile settings

[pi-profiles](../README.md)

The `ext.pi-profiles` section can be in Pi's global `settings.json`, in a trusted project's `.pi/settings.json`, or in both. Run `/reload` after you edit settings or a prompt file.

## Where settings apply

- Project settings apply only in a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). In an untrusted project, pi-profiles ignores project profiles and project MCP presets, including saved ones; see [sessions](sessions.md#restoration).
- Pi reads project settings only from the current directory, not from parent directories.

When both files set the section, the project settings take precedence:

- A project profile replaces the global profile with the same name, in the same position. The other project profiles follow the global profiles.
- A project MCP preset replaces the global preset with the same name, in the same position. The other project presets follow the global presets.
- A project `defaultProfile` or `shortcut` replaces the global one.

## Section fields

| Field            | Meaning                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | Array of up to 100 profiles in each file. The shortcut selects them in array order, then selects no profile.                                  |
| `defaultProfile` | Optional name of the profile for interactive sessions without a selection or `--profile`; see [startup profile](sessions.md#startup-profile). |
| `shortcut`       | Optional key in [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax). Default: `alt+i`. See [shortcut keys](#shortcut-keys).    |
| `mcpPresets`     | Optional object that maps up to 100 preset names to [MCP presets](#mcp-preset-fields) in each file. See [preset order](#preset-order).        |

### Shortcut keys

- **Esc** with a modifier, such as `ctrl+escape`, is not accepted. Function keys **F1** to **F12** with a modifier, such as `alt+f5`, are accepted.
- Pi skips a key when it detects a conflict with a reserved key, such as `shift+tab` under the default bindings, and shows a warning. Pi's conflict check does not detect every equivalent key combination.
- If the key overlaps a key that pi-prompt-manager or pi-subagents claims, none of them registers it, and a warning shows.

## Profile fields

| Field                 | Meaning                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | Required unique name of 1 to 64 characters, with no whitespace or control characters. `clear` is reserved.                                                                                                                                                                              |
| `description`         | Required text for the `/profile` list, up to 1,024 characters. A profile change notice that switches to the profile also saves the trimmed text in the session and sends it to the model.                                                                                               |
| `model`               | Optional `provider/model-id` reference.                                                                                                                                                                                                                                                 |
| `thinking`            | Optional level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                                                                                                                                                                                                           |
| `appendSystemPrompts` | Optional array of up to 32 paths of UTF-8 text files, up to 1 MiB each. A relative path in the global settings resolves from the agent directory, and in the project settings from the project's `.pi` directory. Absolute paths and a leading `~` also work.                           |
| `tools`               | Optional object with `allow`, `deny`, and `defer` arrays of up to 256 entries each. An entry is a tool name or a `*` pattern of 1 to 256 characters; see [patterns](tools.md#patterns). A `defer` entry can also be a [group](tools.md#groups): an array of 1 to 256 names or patterns. |
| `mcpServers`          | Optional object that maps up to 32 server names to entries in the shape of `mcpServers` entries in Pi's [`mcp.json`](https://pi.dev/docs/latest/mcp). Pi checks each name and entry at a switch; see [MCP servers](switching.md#mcp-servers).                                           |
| `mcpPresets`          | Optional array of up to 200 preset names from either settings file; see [MCP presets](switching.md#mcp-presets) for how a switch applies or omits it.                                                                                                                                   |

## MCP preset fields

The key of each `mcpPresets` entry is the preset name: 1 to 64 characters, with no whitespace, control characters, or commas. `clear` is reserved. `--mcp-presets` takes a comma-separated list of these names and trims whitespace around each name. For how presets combine with a profile's servers, read [MCP presets](tools.md#mcp-presets).

| Field         | Meaning                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | Optional text for the `/mcp-presets` list, up to 1,024 characters. Without it, the list shows the server names.                                                                                          |
| `mcpServers`  | Required object that maps 1 to 32 server names to entries in the shape of `mcpServers` entries in Pi's [`mcp.json`](https://pi.dev/docs/latest/mcp). Two of its names cannot differ only in `-` and `_`. |

### Preset order

`/mcp-presets`, the footer, and the numbered warnings for invalid presets list the presets in JavaScript object key order: decimal integer keys from `0` through `4294967294` without leading zeroes come first in numeric order, and all other keys follow in file order. Project presets that do not replace a global preset follow the global presets in the same way.

## Errors

pi-profiles shows settings problems as warnings when settings load. Each warning starts with `pi-profiles: global` or `pi-profiles: project`, for the file that has the problem. Modes without a UI show no warnings.

| Problem                                                                                                                                                                                   | Result                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid profile, including an unknown field                                                                                                                                               | That profile is skipped.                                                                                                                                                     |
| A profile with the name of an earlier valid profile in the same file                                                                                                                      | That profile is skipped.                                                                                                                                                     |
| A profile with the name `clear`                                                                                                                                                           | That profile is skipped.                                                                                                                                                     |
| A file in `appendSystemPrompts` can't be read                                                                                                                                             | That profile is skipped.                                                                                                                                                     |
| A project profile has a server with `auth` in `mcpServers`                                                                                                                                | That profile is skipped. Pi does not allow `auth` in a project `mcp.json`, so that a repository cannot choose where a Pi login token goes. Global profiles can use `auth`.   |
| Invalid MCP preset, including an unknown field, a name with whitespace, a control character, or a comma, or the name `clear`                                                              | That preset is skipped. The warning names the preset by its position in the file's `mcpPresets`, counted from 1.                                                             |
| A project MCP preset has a server with `auth`                                                                                                                                             | That preset is skipped, for the same reason as a project profile.                                                                                                            |
| An MCP preset has two server names that differ only in `-` and `_`                                                                                                                        | That preset is skipped, because Pi refuses the second server.                                                                                                                |
| `mcpPresets` is not an object, or has more than 100 entries                                                                                                                               | All presets of that file are ignored. Its other fields still apply.                                                                                                          |
| A profile's `mcpPresets` lists a name twice, names a preset that neither file configures, or names two presets whose servers [clash](tools.md#mcp-presets)                                | That profile is skipped.                                                                                                                                                     |
| A preset in a profile's `mcpPresets` has a server whose name is a name in the profile's `mcpServers`, or differs from it only in `-` and `_`                                              | That profile is skipped, also when `--mcp-presets` is passed. A preset that you turn on at run time replaces such a server instead; see [MCP presets](tools.md#mcp-presets). |
| `--mcp-presets` has an empty entry, lists a name twice, names no configured preset, combines `clear` with names, or names presets whose servers clash                                     | pi-profiles shows an error when Pi starts, or writes it to stderr in modes without a UI, and ignores the whole flag.                                                         |
| Invalid `shortcut`                                                                                                                                                                        | It is ignored. The other file's `shortcut` or `alt+i` is used.                                                                                                               |
| `defaultProfile` names no valid profile                                                                                                                                                   | No profile applies by default. A project value, also `null`, does not fall back to the global value.                                                                         |
| `--profile` names no valid profile                                                                                                                                                        | pi-profiles shows an error, or writes it to stderr in modes without a UI. The run continues as without `--profile`.                                                          |
| `settings.json` can't be read or parsed, including a file that the [shared settings reader](../../../libs/src/settings-file/README.md#behaviour) rejects, or the section is not an object | That file's section is ignored. The other file still applies.                                                                                                                |
| `profiles` is not an array, or has more than 100 entries                                                                                                                                  | All profiles of that file are ignored. Its other fields still apply.                                                                                                         |
| The section has an unknown field                                                                                                                                                          | That field is ignored.                                                                                                                                                       |
| The session's selected profile is no longer configured                                                                                                                                    | pi-profiles restores none of its texts, servers, or tools; active MCP presets stay as in [restoration](sessions.md#restoration).                                             |
