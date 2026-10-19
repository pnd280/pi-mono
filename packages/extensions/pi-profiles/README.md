# pi-profiles

To change how Pi works on a task, you change the model, the thinking level, the tools, and the instructions separately. pi-profiles changes all four together with one key press or `/profile <name>`.

Define profiles in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or in a trusted project's `.pi/settings.json`; see [configuration](#configuration):

```json
{
  "ext.pi-profiles": {
    "defaultProfile": "build",
    "profiles": [
      {
        "name": "build",
        "description": "Write and test code",
        "model": "anthropic/claude-sonnet-4-5",
        "thinking": "medium"
      },
      {
        "name": "plan",
        "description": "Read and plan without changing files",
        "model": "openai-codex/gpt-5.1",
        "thinking": "high",
        "appendSystemPrompts": ["profiles/plan.md"],
        "tools": { "deny": ["edit", "write"] }
      }
    ]
  }
}
```

Here `~/.pi/agent/profiles/plan.md` contains the instructions for the `plan` profile, for example `Plan only. Do not change files.`

Switching from `build` to `plan` shows a notice with the tool changes:

```text
Profile plan: tools removed edit, write
```

The right end of the editor's top border shows the selected profile:

```text
──────────────────────────────────────── plan ─
```

## Usage

1. Define profiles in [settings](#configuration).
2. Press **Alt+I** to switch to the next profile, in the order of the settings. After the last profile, **Alt+I** selects no profile, and then the first profile again. Run `/profile` to open the [menu](#menu), `/profile <name>` to switch directly, or `/profile clear` to select no profile.
3. To start with a profile, run `pi --profile <name>`, or `pi --profile clear` for no profile. This works in every mode, for example `pi -p --profile plan "Review the diff"`.

Pi shows a warning at each start that its built-in `tool-search` extension was not loaded, because pi-profiles replaces it. Profiles work with or without the warning. To stop it, see [tool search](#tool-search).

## Behaviour

A switch changes these settings for the current session only:

| Field                 | When the profile sets it                                             | When the profile omits it  |
| --------------------- | -------------------------------------------------------------------- | -------------------------- |
| `model`               | Selects the model.                                                   | The model does not change. |
| `thinking`            | Sets the thinking level, which Pi limits to what the model supports. | See below.                 |
| `appendSystemPrompts` | Adds the files' texts to the system prompt from the next request.    | Adds no text.              |
| `tools`               | Selects the declared tools; see [tools](#tools).                     | Keeps the base tools.      |

- Without `thinking`, pi-profiles does not set the level. A `model` change can still change it, because Pi then applies the level that its settings set for that model, or its default level. Without those settings, Pi keeps the current level, limited to what the model supports.
- pi-profiles reads the texts when settings load, so run `/reload` after you edit a file.
- pi-profiles trims each text and leaves out empty texts.
- pi-profiles joins the texts with a blank line (`\n\n`) and adds them after Pi's append text, such as `APPEND_SYSTEM.md`, `--append-system-prompt`, and changes from earlier extensions.
- In every load order, the texts follow the model-specific text of [pi-model-prompt](../pi-model-prompt/README.md), which sees the profile's model.
- A switch to the current profile applies it again, for example after you edit settings and run `/reload`.
- No profile undoes the previous profile's tool changes and adds no texts. The model and the thinking level do not change.
- In the interactive terminal, the editor's top border shows the selected profile's name. With no profile, it shows no name.
- The name does not cover other text in the border, such as Pi's working status, so pi-profiles does not show it when the border is too narrow for both.
- pi-profiles saves each switch in the session. Resume, `/fork`, `/tree`, and `/reload` use the branch's latest selection; read [sessions](docs/sessions.md) for what each one restores.

When a switch cannot apply:

- pi-profiles refuses a switch while the agent runs, or while an earlier switch still waits for its model. Wait for the run to end, or stop it first.
- If the model is unknown or has no credentials, pi-profiles does not apply the profile and shows an error. This also applies when the model is already selected.
- Modes without a UI write the error to stderr.
- The credentials check is Pi's check for configured credentials: a key command or a stored login counts before a request uses it.

You cannot cancel a switch. A request, tree navigation, session replacement, and the end of the session wait until the switch is complete.

### Menu

In the interactive terminal, `/profile` opens a menu with two views. Press **Tab** to change the view, and type to search. The details of the selected row show below the list. When the terminal is short, the menu cuts the details and marks the cut with `…`.

- The "Profiles" view lists the profiles, then `clear`, and marks the current one. Press **Enter** to switch.
- The details in "Profiles" show the profile's model, thinking level, tool lists, and appended prompts, and the tool change that a switch would request now. Pi can still leave out an MCP tool that a `--tools` list does not name. The details also show when the model is unknown or has no credentials.
- The "Tools" view lists every registered tool with its state and exposure, and counts the tools in each state.
- The details in "Tools" explain the state, name the selected profile's rule for the tool, and show whether the model called the tool on the current branch. They also show the tool's source and description.

In "Profiles", the `defer` list shows each [group](docs/tools.md#groups) in square brackets. In "Tools", the details of a tool in a deferred group name the other tools that load with it.

| State        | Meaning                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `active`     | Pi has activated the tool. [Codemode-only mode](docs/tools.md#codemode-only-mode) can still hide its declaration. |
| `deferred`   | The selected profile deferred the tool. The details tell whether the active `tool_search` can load it.            |
| `searchable` | The tool is not active. Its exposure is `codemode` or `deferred`, so `tool_search` can load it.                   |
| `off`        | The tool is not active, and `tool_search` cannot load it.                                                         |
| `hidden`     | The tool has `hidden` exposure, so nothing can reach it.                                                          |

The menu shows the state when it opens. In RPC mode, `/profile` shows a plain list of the profiles instead.

### Tools

A profile declares the tools in `allow`, or else the base tools: the tools that are declared without a profile. pi-profiles turns `deny` tools off at the start of each run and at the end of each turn, and stops declaring `defer` tools that the branch has not used and that `tool_search` can load again; read [profile tools](docs/tools.md) for the exceptions.

This profile defers the GitHub MCP tools that the branch has not used, so the model loads them with `tool_search` when it needs them, and keeps `bash` off:

```json
{
  "name": "review",
  "description": "Review code",
  "tools": { "deny": ["bash"], "defer": ["mcp__github__*"] }
}
```

| When you…                                                       | Read                                         |
| --------------------------------------------------------------- | -------------------------------------------- |
| Use `*` patterns, `defer`, groups, or codemode-only mode        | [Profile tools](docs/tools.md)               |
| Use MCP servers with profiles                                   | [MCP tools](docs/tools.md#mcp-tools)         |
| Resume, fork, use `/tree` or `/reload`, or start with a profile | [Profiles across sessions](docs/sessions.md) |

### Tool search

pi-profiles registers its own copy of Pi's `tool_search`, which also finds the tools that a profile deferred. pi-profiles registers it also when no profile has a `defer` list. An extension cannot see the project trust decision while it loads, so it cannot tell whether a project profile has one. Read [tool search](docs/tools.md#tool-search) for what the search finds and loads.

- Pi then does not load its built-in `tool-search` extension, and it shows a warning at each start.
- To stop the warning, add `"-builtin:tool-search"` to `extensions` in `settings.json`.
- If you remove pi-profiles later, remove that entry too, or no `tool_search` is available, also for MCP servers with `deferred` exposure.

## Configuration

Put the `ext.pi-profiles` section in the global settings, in the project's `.pi/settings.json`, or in both. Run `/reload` after you edit settings or a prompt file.

Project settings apply only in a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), because profiles select tools and system prompt text. In an untrusted project, pi-profiles ignores them. Pi reads them only from the current directory, not from parent directories.

When both files set the section, the project settings take precedence:

- A project profile replaces the global profile with the same name, in the same position. The other project profiles follow the global profiles.
- A project `defaultProfile` or `shortcut` replaces the global one.

| Field            | Meaning                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | Array of up to 100 profiles in each file. The shortcut follows the order above, then selects no profile.                                                                                                                                                                                                                           |
| `defaultProfile` | Optional name of the profile for interactive sessions without a selection or `--profile`; see [startup profile](docs/sessions.md#startup-profile).                                                                                                                                                                                 |
| `shortcut`       | Optional key in [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax). Default: `alt+i`. Pi skips a key that conflicts with its own reserved keys, such as `shift+tab`, and shows a warning. If the key overlaps a key that pi-prompt-manager or pi-subagents claims, none of them registers it, and a warning shows. |

Each profile has these fields:

| Field                 | Meaning                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | Required unique name, up to 64 characters, without spaces or control characters. `clear` is reserved.                                                                                                                                                                                             |
| `description`         | Required text for the `/profile` list, up to 1,024 characters.                                                                                                                                                                                                                                    |
| `model`               | Optional `provider/model-id` reference.                                                                                                                                                                                                                                                           |
| `thinking`            | Optional level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                                                                                                                                                                                                                     |
| `appendSystemPrompts` | Optional array of up to 32 paths of UTF-8 text files, up to 1 MiB each. A relative path in the global settings resolves from the agent directory, and in the project settings from the project's `.pi` directory. Absolute paths and a leading `~` also work.                                     |
| `tools`               | Optional object with `allow`, `deny`, and `defer` arrays of up to 256 entries each. An entry is a tool name or a `*` pattern of 1 to 256 characters; see [patterns](docs/tools.md#patterns). A `defer` entry can also be a [group](docs/tools.md#groups): an array of 1 to 256 names or patterns. |

### Errors

pi-profiles shows settings problems as warnings when settings load. Each warning starts with `pi-profiles: global` or `pi-profiles: project`, for the file that has the problem. Modes without a UI show no warnings.

| Problem                                                        | Result                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Invalid profile, including an unknown field                    | That profile is skipped.                                                                                                          |
| A profile with the name of an earlier profile in the same file | That profile is skipped.                                                                                                          |
| A profile with the name `clear`                                | That profile is skipped.                                                                                                          |
| A file in `appendSystemPrompts` can't be read                  | That profile is skipped.                                                                                                          |
| Invalid `shortcut`                                             | It is ignored. The other file's `shortcut` or `alt+i` is used.                                                                    |
| `defaultProfile` names no valid profile                        | No profile applies by default. A project value, also `null`, does not fall back to the global value.                              |
| `--profile` names no valid profile                             | pi-profiles shows an error, or writes it to stderr in modes without a UI. The run continues as without `--profile`.               |
| `settings.json` can't be read, or the section is not an object | That file's section is ignored. The other file still applies.                                                                     |
| The session's selected profile is no longer configured         | pi-profiles adds none of its texts. Its saved selection still decides the tools on restoration; see [sessions](docs/sessions.md). |

## Side effects

- pi-profiles registers the `--profile` option.
- pi-profiles adds a selection entry to the session on each switch.
- Pi records model and thinking changes in the session.
- pi-profiles replaces Pi's built-in `tool-search` extension with its own copy of `tool_search`; see [tool search](#tool-search).
- Before each run and at the end of each turn, pi-profiles turns off the selected profile's `deny` tools; see [declared tools](docs/tools.md#declared-tools).
- At the same times, pi-profiles puts the declared tools in a fixed order, also without a profile.
- In the interactive terminal, when profiles are configured, pi-profiles replaces the editor with the same editor plus the profile name. It keeps the editor of an extension that loaded earlier.
- An extension that loads later and discards the earlier editor removes the profile name.
- A switch changes the system prompt or the declared tools, so the provider may not reuse its prompt cache for the next request.
- pi-profiles writes no files of its own. Pi saves the selection entries in the session file.
- pi-profiles makes no network requests itself.

## Validation

| When you…                   | Read                                         |
| --------------------------- | -------------------------------------------- |
| Decide where a test belongs | [testing](docs/testing.md)                   |
| Upgrade Pi                  | [Pi compatibility](docs/pi-compatibility.md) |
