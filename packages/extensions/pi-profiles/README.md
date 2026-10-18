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
2. Optional: Pi shows a warning at each start that its built-in `tool-search` extension was not loaded, because pi-profiles replaces it. Profiles work with or without the warning. To stop it, see [tool search](#tool-search).
3. Press **Alt+I** to switch to the next profile, in the order of the settings. After the last profile, **Alt+I** selects no profile, and then the first profile again. Run `/profile` to open the [menu](#menu), `/profile <name>` to switch directly, or `/profile clear` to select no profile.
4. To start with a profile, run `pi --profile <name>`, or `pi --profile clear` for no profile. This works in every mode, for example `pi -p --profile plan "Review the diff"`.

## Behaviour

A switch changes these settings for the current session only:

| Field                 | When the profile sets it                                             | When the profile omits it  |
| --------------------- | -------------------------------------------------------------------- | -------------------------- |
| `model`               | Selects the model.                                                   | The model does not change. |
| `thinking`            | Sets the thinking level, which Pi limits to what the model supports. | See below.                 |
| `appendSystemPrompts` | Adds the files' texts to the system prompt from the next request.    | Adds no text.              |
| `tools`               | Selects the declared tools; see [tools](#tools).                     | Keeps the base tools.      |

- Without `thinking`, pi-profiles does not set the level. A `model` change can still change it, because Pi then applies the level that its settings set for that model, or its default level. Without those settings, Pi keeps the current level, limited to what the model supports.
- Switches are refused while the agent runs, or while an earlier switch still waits for its model. Wait for the run to end, or stop it first. A switch cannot be cancelled. A request, tree navigation, session replacement, and the end of the session wait until the switch is complete.
- If the model is unknown or has no credentials, the profile is not applied, and an error is shown. This also applies when the model is already selected. Modes without a UI write the error to stderr. The check is Pi's check for configured credentials: a key command or a stored login counts before a request uses it.
- The texts are read when settings load, so run `/reload` after you edit a file. Each text is trimmed, and empty texts are left out.
- The texts are joined with a blank line (`\n\n`) and added after Pi's append text, such as `APPEND_SYSTEM.md`, `--append-system-prompt`, and changes from earlier extensions.
- A switch to the current profile applies it again, for example after you edit settings and run `/reload`.
- No profile undoes the previous profile's tool changes and adds no texts. The model and the thinking level do not change.
- In the interactive terminal, the editor's top border shows the selected profile's name. With no profile, it shows no name. The name does not cover other text in the border, such as Pi's working status, so it is not shown when the border is too narrow for both.

### Menu

In the interactive terminal, `/profile` opens a menu with two views. Press **Tab** to change the view, and type to search. The details of the selected row show below the list. When the terminal is short, the details are cut, and `…` marks the cut.

- **Profiles** lists the profiles, then `clear`, and marks the current one. Press **Enter** to switch. The details show the profile's model, thinking level, tool lists, and appended prompts, and the tool change that a switch would request now. Pi can still leave out an MCP tool that a `--tools` list does not name. They also show when the model is unknown or has no credentials.
- **Tools** lists every registered tool with its state and exposure, and counts the tools in each state. The details explain the state, name the selected profile's rule for the tool, and show whether the model called the tool on the current branch. They also show the tool's source and description.

In **Profiles**, the `defer` list shows each [group](#groups) in square brackets. In **Tools**, the details of a tool in a deferred group name the other tools that load with it.

| State        | Meaning                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `active`     | Pi has activated the tool. [Codemode-only mode](#codemode-only-mode) can still hide its declaration.   |
| `deferred`   | The selected profile deferred the tool. The details tell whether the active `tool_search` can load it. |
| `searchable` | The tool is not active. Its exposure is `codemode` or `deferred`, so `tool_search` can load it.        |
| `off`        | The tool is not active, and `tool_search` cannot load it.                                              |
| `hidden`     | The tool has `hidden` exposure, so nothing can reach it.                                               |

The menu shows the state when it opens. In RPC mode, `/profile` shows a plain list of the profiles instead.

### Tools

A profile declares `allow`, or else the base tools, without the tools in `deny`. The base tools are the tools that are declared without a profile: before the first switch, the current tools; later, the current tools with the previous profile's additions and removals undone. Changes made after a switch, such as tools that `tool_search` loaded, stay in the base.

Each entry in `allow`, `deny`, and `defer` is a tool name or a pattern in which `*` matches any characters, as in Pi's `--tools`. For example, `mcp__github__*` matches each tool of the `github` MCP server, and `*` matches every tool. A pattern in `allow` has these limits:

- As in `--tools`, a pattern in `allow` turns on only `direct` and `model-only` tools.
- A pattern in `allow` keeps the `codemode` and `deferred` tools that are base tools, such as tools that `tool_search` loaded. To declare another `codemode` or `deferred` tool, put its name in `allow`.
- A pattern in `allow` matches only the tools that are registered when you switch. For a tool that registers later, for example from an MCP server that connects later, switch again.
- Until you switch again, Pi decides whether a tool that registers later is declared; see [MCP tools](#mcp-tools).

A tool in `defer` is not declared, but the model can load it again with `tool_search`. A switch decides each `defer` tool that the profile would declare:

| Tool before the switch                       | Result                   |
| -------------------------------------------- | ------------------------ |
| Not declared                                 | It stays undeclared.     |
| Declared, and not used on the current branch | It stops being declared. |
| Declared, and used on the current branch     | It stays declared.       |

- Deferral applies to tools of every exposure except `hidden`. Pi's `tool_search` loads tools with `codemode` or `deferred` exposure, such as MCP tools by default. For `direct` and `model-only` tools, such as `bash` and `edit`, pi-profiles uses its own [tool search](#tool-search).
- A profile that defers a `direct` or `model-only` tool also declares `tool_search`.
- A `direct` or `model-only` tool stays declared if `tool_search` can't load it again: when `deny` lists `tool_search`, or when another extension owns `tool_search`. To remove a tool, use `deny`.
- A `codemode` or `deferred` tool stays declared if the profile does not declare `tool_search`, for example because `allow` omits it or `deny` lists it.
- `tool_search` does not load `deny` tools with `direct` or `model-only` exposure. Denied `codemode` and `deferred` tools stay reachable; see [MCP tools](#mcp-tools).
- Codemode scripts can call deferred `codemode` and `deferred` tools while `codemode` is declared, but not deferred `direct` or `model-only` tools.
- "Used" means that the model called the tool directly; calls from codemode scripts do not count. Names of tools that are not registered are ignored.
- The switch notice lists deferred tools apart from removed tools, for example `Profile review: tools added tool_search; deferred bash, edit`.

#### Groups

An entry in `defer` can also be an array of names and patterns: a group. The tools of a group are deferred together, and `tool_search` loads them together:

```json
{ "tools": { "defer": ["mcp__linear__*", ["edit", "write"], ["mcp__github__*"]] } }
```

Here each Linear tool is deferred alone, but one search can load more than one of them. When the model loads `edit`, `write` is loaded too, and when it loads one GitHub tool, all GitHub tools are loaded. This profile has no `allow`, so its entries match only the base tools.

- A tool belongs to the first `defer` entry that matches it. To keep a tool out of a group, put an entry that matches it before the group.
- A group is deferred only as a whole. If one of its tools stays declared, for example because the model used it, all its tools stay declared, also those that were not declared before the switch.
- Only pi-profiles' [tool search](#tool-search) loads a group together. A group with more than one tool stays declared when `deny` lists `tool_search`, or when another extension owns `tool_search`.
- A group contains only the tools that the profile would declare: `allow`, or else the base tools, without `deny`. It never contains `tool_search`, `hidden` tools, or tools that are not registered. `tool_search` loads no other tools as group tools, but it can still load a `codemode` or `deferred` tool that matches the query; see [MCP tools](#mcp-tools).
- The `tool_search` result names only the tools that match the query. The other tools of their groups are declared from the next request too.

#### Codemode-only mode

While `codemode` is declared and `codemode.mode` is `"only"`, Pi leaves the active `direct` tools out of the model request. The codemode description lists them, and the model calls them from codemode scripts. Profiles change Pi's active tools, but they do not override this mode. The mode changes the effect of `defer`:

- After `tool_search` loads a deferred `direct` tool, the model can call it only from codemode scripts, because Pi hides its declaration.
- The `tool_search` result still says that the loaded tool is available from the next call.
- Each load of a deferred `direct` tool changes the codemode description, so Pi declares `codemode` again.
- Because Pi already hides `direct` declarations, deferral of a `direct` tool only removes it from the codemode description and from scripts.
- To remove a `direct` tool, use `deny`. To keep it for scripts, leave it out of `defer`.

### Tool search

pi-profiles registers its own `tool_search` while Pi loads extensions. It is Pi's `tool_search`, built with Pi's own code: it has the same name, description, and search. It also finds the tools that the current profile deferred, and it loads the rest of their [groups](#groups) with them. Without deferred tools, it works as Pi's built-in `tool_search`. It is registered also when no profile has a `defer` list, because an extension cannot see the project trust decision while it loads, so it cannot tell whether a project profile has one.

- Pi then does not load its built-in `tool-search` extension, and it shows a warning at each start. To stop the warning, add `"-builtin:tool-search"` to `extensions` in `settings.json`. If you remove pi-profiles later, remove that entry too, or no `tool_search` is available, also for MCP servers with `deferred` exposure.
- If pi-profiles no longer owns `tool_search`, for example because another extension now registers it, resume, `/tree`, `/fork`, and `/reload` declare again the `direct` and `model-only` tools that the session's selection deferred. They also declare each registered tool of its deferred groups, except `hidden` tools. If no registered, non-hidden `tool_search` is active, restoration declares all registered, non-hidden deferred tools, subject to Pi's tool restrictions.
- Only one extension can own `tool_search`. If another extension also registers it, Pi reports a conflict at startup.
- [pi-tool-display](../pi-tool-display/src/adapters/pi-profiles/README.md) shows its calls as it shows the calls of Pi's `tool_search`.

The search is Pi's:

- It searches the inactive tools with `codemode` or `deferred` exposure and the profile's deferred tools. It reads each tool's name, description, and parameter names and descriptions, and an MCP server's name, description, and instructions.
- It matches words, not meaning. For example, "shell" finds `bash`, but "terminal" does not.
- It loads up to `limit` matches (8 by default), and the other tools of their deferred groups. These group tools can make the total more than `limit`, and the result does not name them. For example, "edit a file" can match `edit`, `write`, `read`, and `bash`, because each description contains "file".
- The model does not see deferred tools until it searches, and codemode does not list deferred `direct` tools. Tell the model what to search for in a file in `appendSystemPrompts`, for example `To run shell commands, load bash with tool_search.`

### MCP tools

Pi names each MCP tool `mcp__<server>__<tool>`. It replaces each character other than a letter, a digit, or `_` with `_`. A name longer than 64 characters, or a name that another tool has, is shortened and gets a hash at the end. Profiles take these names, or patterns such as `mcp__github__*`; see [tools](#tools). The tool's [exposure](https://pi.dev/docs/latest/mcp#control-tool-exposure) decides what a profile can change:

| Exposure                           | Effect of `allow` and `deny`                                                                                                                                                          | Effect of `defer`                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `direct`                           | They decide whether the model can call the tool.                                                                                                                                      | It applies through pi-profiles' [tool search](#tool-search). |
| `codemode` (default) or `deferred` | They decide only whether the tool is declared. Only its name in `allow` declares it; see [tools](#tools). Codemode scripts can still call it, and `tool_search` can declare it again. | It applies.                                                  |
| `hidden`                           | None; the tool is unreachable.                                                                                                                                                        | None.                                                        |

To make a tool unavailable in every profile, give it `hidden` exposure in Pi's MCP configuration.

Pi's MCP support also changes the declared tools by itself, so the profile does not always decide them:

| Case                                                                                                                                                 | What happens                                                                                                                                                                                                                                 | What to do                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A server connects or adds tools after a switch. At startup this is usual, because servers connect in the background.                                 | Pi declares the new `direct` tools, whatever `allow`, `deny`, and `defer` say.                                                                                                                                                               | Switch again after the server connects.                                                                                                             |
| `allow` names a tool of a server that has not connected yet.                                                                                         | The name is ignored. A `direct` tool is declared when it appears, as above; a `codemode` or `deferred` tool stays undeclared.                                                                                                                | Switch again after the server connects.                                                                                                             |
| `allow` omits `codemode` or `tool_search`, `deny` lists them, or `defer` lists `codemode`.                                                           | When a session starts, when the server list changes, after a sign-in, and after `/mcp` actions such as reconnect, Pi declares `codemode` again for servers with `codemode` exposure, and `tool_search` for servers with `deferred` exposure. | Switch again after these events. To keep `codemode` off, set `"autoEnableCodemode": false` beside `mcpServers`. No setting keeps `tool_search` off. |
| You resume, fork, or reload a session while a server is still connecting, and pi-profiles changes the tools at that time; see [sessions](#sessions). | If the change turns off a tool, tools that the model loaded from that server with `tool_search` disappear.                                                                                                                                   | The model can load them again with `tool_search`.                                                                                                   |

### Sessions

- Each switch, also to no profile, saves the selection in the session. The model does not see it.
- Resume, `/fork`, and `/tree` use the latest selection on the branch: its texts are added, its tools are declared, and `tool_search` can load its deferred tools. If a request followed the switch, also one that did not change the tools, the tools of the last request are declared instead, so later changes, such as tools that `tool_search` loaded, stay.
- `/tree` to a branch with no selection and no recorded tools undoes the outgoing profile's tool changes.
- `/reload` keeps the selection and the declared tools. Pi turns on again the `direct` and `model-only` extension tools that are active by default, as it does without profiles. pi-profiles then turns off again the tools that the selection turned off, unless a request after the switch declared them. So if you turn on such a tool after the last request, it turns off again, as on resume.
- Pi restores the model and the thinking level of the branch on resume and `/fork`, but not on `/tree`. After `/tree`, switch again to use the profile's model.
- `--profile` applies when Pi starts, in every mode. It replaces the selection of a session that you open with `--continue`, `--resume`, `--session`, or `--fork`. Later sessions in the same run, for example after `/new` or `/resume`, keep their own selection; on a branch without a selection, `--profile` applies instead of `defaultProfile`.
- `defaultProfile` applies when an interactive session starts on a branch without a selection and without `--profile`, including resumed sessions from before you used profiles. No profile is a selection, so after `/profile clear` the default profile does not apply to that branch.
- A profile from `--profile` or `defaultProfile` replaces `--model` and `--thinking` choices for that session. It cannot declare a tool that a `--tools` list without `+` or `-` entries leaves out, because Pi does not register that tool. MCP tools are an exception: unless the list names an MCP tool, Pi keeps them for codemode and `tool_search`, and a profile can declare those that do not have `direct` exposure while `tool_search` is registered.
- Print, JSON, and RPC modes, including subagents, never apply `defaultProfile`. Without `--profile`, they keep the model and tools that they were given.

## Configuration

Put the `ext.pi-profiles` section in the global settings, in the project's `.pi/settings.json`, or in both. Run `/reload` after you edit settings or a prompt file.

Project settings apply only in a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), because profiles select tools and system prompt text. In an untrusted project, they are ignored. Pi reads them only from the current directory, not from parent directories.

When both files set the section, the project settings take precedence:

- A project profile replaces the global profile with the same name, in the same position. The other project profiles follow the global profiles.
- A project `defaultProfile` or `shortcut` replaces the global one.

| Field            | Meaning                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`       | Array of up to 100 profiles in each file. The shortcut follows the order above, then selects no profile.                                                                                                  |
| `defaultProfile` | Optional name of the profile for interactive sessions without a selection or `--profile`; see [sessions](#sessions).                                                                                      |
| `shortcut`       | Optional key in [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax). Default: `alt+i`. Pi skips a key that conflicts with its own reserved keys, such as `shift+tab`, and shows a warning. |

Each profile has these fields:

| Field                 | Meaning                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | Required unique name, up to 64 characters, without spaces or control characters. `clear` is reserved.                                                                                                                                                             |
| `description`         | Required text for the `/profile` list, up to 1,024 characters.                                                                                                                                                                                                    |
| `model`               | Optional `provider/model-id` reference.                                                                                                                                                                                                                           |
| `thinking`            | Optional level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                                                                                                                                                                                     |
| `appendSystemPrompts` | Optional array of up to 32 paths of UTF-8 text files, up to 1 MiB each. A relative path in the global settings resolves from the agent directory, and in the project settings from the project's `.pi` directory. Absolute paths and a leading `~` also work.     |
| `tools`               | Optional object with `allow`, `deny`, and `defer` arrays of up to 256 entries each. An entry is a tool name or a `*` pattern of 1 to 256 characters; see [tools](#tools). A `defer` entry can also be a [group](#groups): an array of 1 to 256 names or patterns. |

### Errors

Settings problems are shown as warnings when settings load. Each warning starts with `pi-profiles: global` or `pi-profiles: project`, for the file that has the problem. Modes without a UI show no warnings.

| Problem                                                        | Result                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid profile, including an unknown field                    | That profile is skipped.                                                                                                                        |
| A profile with the name of an earlier profile in the same file | That profile is skipped.                                                                                                                        |
| A profile with the name `clear`                                | That profile is skipped.                                                                                                                        |
| A file in `appendSystemPrompts` can't be read                  | That profile is skipped.                                                                                                                        |
| Invalid `shortcut`                                             | It is ignored. The other file's `shortcut` or `alt+i` is used.                                                                                  |
| `defaultProfile` names no valid profile                        | No profile applies by default. A project value, also `null`, does not fall back to the global value.                                            |
| `--profile` names no valid profile                             | An error is shown, or written to stderr in modes without a UI. The run continues as without `--profile`.                                        |
| `settings.json` can't be read, or the section is not an object | That file's section is ignored. The other file still applies.                                                                                   |
| The session's selected profile is no longer configured         | Its texts are not added. Its saved selection still decides the tools on restoration; see [sessions](#sessions) and [tool search](#tool-search). |

## Side effects

- Registers the `--profile` option.
- Adds a selection entry to the session on each switch. Pi records model and thinking changes in the session.
- Replaces Pi's built-in `tool-search` extension with its own copy of `tool_search`; see [tool search](#tool-search).
- In the interactive terminal, when profiles are configured, replaces the editor with the same editor plus the profile name. It keeps the editor of an extension that loaded earlier. An extension that loads later and replaces the editor removes the name. An extension that does not replace another extension's editor, such as pi-abort-guard, must load before pi-profiles, or it does not install its editor.
- A switch changes the system prompt or the declared tools, so the provider may not reuse its prompt cache for the next request.
- Writes no files of its own; Pi saves the selection entries in the session file. Makes no network requests itself.

## Validation

| When you…                   | Read                                         |
| --------------------------- | -------------------------------------------- |
| Decide where a test belongs | [testing](docs/testing.md)                   |
| Upgrade Pi                  | [Pi compatibility](docs/pi-compatibility.md) |
