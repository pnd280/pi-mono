# Profile settings

[pi-profiles](../README.md)

The `ext.pi-profiles` section can be in Pi's global `settings.json`, in a trusted project's `.pi/settings.json`, or in both. Run `/reload` after you edit settings or a prompt file.

## Where settings apply

- Project settings apply only in a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). In an untrusted project, pi-profiles ignores them.
- Pi reads project settings only from the current directory, not from parent directories.

When both files set the section, the project settings take precedence:

- A project profile replaces the global profile with the same name, in the same position. The other project profiles follow the global profiles.
- A project `defaultProfile` or `shortcut` replaces the global one.

## Section fields

| Field            | Meaning                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | Array of up to 100 profiles in each file. The shortcut follows the order above, then selects no profile.                                                                                                                                                                                                                           |
| `defaultProfile` | Optional name of the profile for interactive sessions without a selection or `--profile`; see [startup profile](sessions.md#startup-profile).                                                                                                                                                                                      |
| `shortcut`       | Optional key in [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax). Default: `alt+i`. Pi skips a key that conflicts with its own reserved keys, such as `shift+tab`, and shows a warning. If the key overlaps a key that pi-prompt-manager or pi-subagents claims, none of them registers it, and a warning shows. |

## Profile fields

| Field                 | Meaning                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | Required unique name, up to 64 characters, without spaces or control characters. `clear` is reserved.                                                                                                                                                                                   |
| `description`         | Required text for the `/profile` list, up to 1,024 characters.                                                                                                                                                                                                                          |
| `model`               | Optional `provider/model-id` reference.                                                                                                                                                                                                                                                 |
| `thinking`            | Optional level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                                                                                                                                                                                                           |
| `appendSystemPrompts` | Optional array of up to 32 paths of UTF-8 text files, up to 1 MiB each. A relative path in the global settings resolves from the agent directory, and in the project settings from the project's `.pi` directory. Absolute paths and a leading `~` also work.                           |
| `tools`               | Optional object with `allow`, `deny`, and `defer` arrays of up to 256 entries each. An entry is a tool name or a `*` pattern of 1 to 256 characters; see [patterns](tools.md#patterns). A `defer` entry can also be a [group](tools.md#groups): an array of 1 to 256 names or patterns. |

## Errors

pi-profiles shows settings problems as warnings when settings load. Each warning starts with `pi-profiles: global` or `pi-profiles: project`, for the file that has the problem. Modes without a UI show no warnings.

| Problem                                                        | Result                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Invalid profile, including an unknown field                    | That profile is skipped.                                                                                                     |
| A profile with the name of an earlier profile in the same file | That profile is skipped.                                                                                                     |
| A profile with the name `clear`                                | That profile is skipped.                                                                                                     |
| A file in `appendSystemPrompts` can't be read                  | That profile is skipped.                                                                                                     |
| Invalid `shortcut`                                             | It is ignored. The other file's `shortcut` or `alt+i` is used.                                                               |
| `defaultProfile` names no valid profile                        | No profile applies by default. A project value, also `null`, does not fall back to the global value.                         |
| `--profile` names no valid profile                             | pi-profiles shows an error, or writes it to stderr in modes without a UI. The run continues as without `--profile`.          |
| `settings.json` can't be read, or the section is not an object | That file's section is ignored. The other file still applies.                                                                |
| The session's selected profile is no longer configured         | pi-profiles adds none of its texts. Its saved selection still decides the tools on restoration; see [sessions](sessions.md). |
