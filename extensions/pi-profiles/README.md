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
2. Press **Alt+I** to switch to the next profile, in the order of the settings. After the last profile, **Alt+I** selects no profile, and then the first profile again. Run `/profile` to open the [menu](docs/menu.md), `/profile <name>` to switch directly, or `/profile clear` to select no profile.
3. To start with a profile, run `pi --profile <name>`, or `pi --profile clear` for no profile. This works in every mode, for example `pi -p --profile plan "Review the diff"`.

Pi shows a warning at each start that its built-in `tool-search` extension was not loaded, because pi-profiles replaces it. Profiles work with or without the warning. To stop it, see [tool search](#tool-search).

## Behaviour

A switch changes these settings for the current session only:

| Field                 | When the profile sets it                                             | When the profile omits it                      |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `model`               | Selects the model.                                                   | The model does not change.                     |
| `thinking`            | Sets the thinking level, which Pi limits to what the model supports. | pi-profiles does not set the level.            |
| `appendSystemPrompts` | Adds the files' texts to the system prompt from the next request.    | Adds no text.                                  |
| `tools`               | Selects the declared tools; see [tools](#tools).                     | Keeps the tools that are declared without one. |

pi-profiles refuses a switch while the agent runs, and does not apply a profile whose model is unknown or has no credentials. pi-profiles saves each switch in the session, so resume, `/fork`, `/tree`, and `/reload` keep the branch's profile.

| When you…                                                               | Read                                         |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| Want the exact effect of a switch, of no profile, or why a switch fails | [Profile switches](docs/switching.md)        |
| Use the `/profile` menu and its tool states                             | [Profile menu](docs/menu.md)                 |
| Resume, fork, use `/tree` or `/reload`, or start with a profile         | [Profiles across sessions](docs/sessions.md) |

### Tools

A profile declares the tools in `allow`, or else the base tools: the tools that are declared without a profile. pi-profiles keeps the `deny` tools off, and stops declaring `defer` tools that the branch has not used and that `tool_search` can load again.

This profile defers the GitHub MCP tools that the branch has not used, so the model loads them with `tool_search` when it needs them, and keeps `bash` off:

```json
{
  "name": "review",
  "description": "Review code",
  "tools": { "deny": ["bash"], "defer": ["mcp__github__*"] }
}
```

| When you…                                                | Read                                 |
| -------------------------------------------------------- | ------------------------------------ |
| Use `*` patterns, `defer`, groups, or codemode-only mode | [Profile tools](docs/tools.md)       |
| Use MCP servers with profiles                            | [MCP tools](docs/tools.md#mcp-tools) |

## Tool search

pi-profiles registers its own copy of Pi's `tool_search`, which also finds the tools that a profile deferred. It registers the copy also when no profile has a `defer` list. Read [tool search](docs/tools.md#tool-search) for what the search finds and loads.

- Pi then does not load its built-in `tool-search` extension, and it shows a warning at each start.
- To stop the warning, add `"-builtin:tool-search"` to `extensions` in `settings.json`.
- If you remove pi-profiles later, remove that entry too, or no `tool_search` is available, also for MCP servers with `deferred` exposure.

## Configuration

Put the `ext.pi-profiles` section in the global settings, in the project's `.pi/settings.json`, or in both. Run `/reload` after you edit settings or a prompt file.

Project settings apply only in a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), because profiles select tools and system prompt text. In an untrusted project, pi-profiles ignores them. When both files set the section, the project settings take precedence.

The section has a `profiles` array, an optional `defaultProfile` for interactive sessions, and an optional `shortcut` that replaces **Alt+I**. Each profile needs a `name` and a `description`. Read [settings](docs/configuration.md) for the merge rules, every field and limit, and the warnings for invalid settings.

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
