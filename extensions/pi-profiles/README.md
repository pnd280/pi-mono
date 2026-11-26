# pi-profiles

Without profiles, you change Pi's model, thinking level, instructions, tools, and MCP servers separately for each task; pi-profiles changes all five together with one key press or `/profile <name>`. MCP presets are named sets of MCP servers that you turn on and off on top of any profile with `/mcp-presets`.

Switching from a `build` profile to a `plan` profile that denies `edit` and `write` shows a notice with the tool changes:

```text
Profile plan: tools removed edit, write
```

The right end of the editor's top border shows the selected profile:

```text
──────────────────────────────────────── plan ─
```

## Controls

| Control                             | Effect                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alt+I**                           | Switch to the next profile, in the order of the settings. After the last profile, select no profile, and then the first profile again.         |
| `/profile`                          | Open the [menu](docs/menu.md) of profiles and tools in the interactive terminal.                                                               |
| `/profile <name>`                   | Switch to a profile.                                                                                                                           |
| `/profile clear`                    | Select no profile.                                                                                                                             |
| `pi --profile <name>`               | Start with a profile, in every mode, for example `pi -p --profile plan "Review the diff"`.                                                     |
| `pi --profile clear`                | Start with no profile.                                                                                                                         |
| `/mcp-presets`                      | Open the [list of MCP presets](docs/menu.md#mcp-presets-menu) and turn them on or off. RPC mode shows a plain list.                            |
| `/mcp-presets <name>`               | Turn an [MCP preset](docs/tools.md#mcp-presets) on or off.                                                                                     |
| `/mcp-presets clear`                | Turn all MCP presets off.                                                                                                                      |
| `pi --mcp-presets=<a,b>`            | Start with these comma-separated MCP presets, in every mode, for example `pi --mcp-presets=github`. `pi --mcp-presets=clear` starts with none. |
| `tool_search` model tool            | Pi's `tool_search`, which also finds the tools that a profile deferred; see [tool search](docs/tools.md#tool-search).                          |
| Resume, `/fork`, `/tree`, `/reload` | Restore the branch's profile and MCP presets; see [profiles across sessions](docs/sessions.md).                                                |

## Usage

A switch changes the profile's settings for the current session only. pi-profiles refuses a switch while the agent runs, and does not apply a profile whose model is unknown or has no credentials. pi-profiles saves each switch in the session, so resume, `/fork`, `/tree`, and `/reload` keep the branch's profile. The active MCP presets are saved on the branch in the same way.

## Configuration

Put the `ext.pi-profiles` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), in `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), or in both. Project settings apply only in a trusted project, because profiles select tools and system prompt text. When both files set the section, the project settings take precedence. Run `/reload` after you edit settings or a prompt file.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-profiles": {
    // Optional. The profile for interactive sessions without a selection or --profile. Default: none.
    "defaultProfile": "build",
    // Optional. The key that switches to the next profile, in Pi key syntax. Default: "alt+i".
    "shortcut": "alt+i",
    // Optional. Named sets of MCP servers in each settings file, which /mcp-presets turns on and off with any profile. Omit it to add no presets from this file.
    "mcpPresets": {
      // The key is the preset name: unique, 1 to 64 characters, without whitespace, control characters, or commas. "clear" is reserved.
      "github": {
        // Optional. The text in the /mcp-presets list, up to 1,024 characters. Default: the server names.
        "description": "GitHub issues and pull requests",
        // Required. 1 to 32 MCP servers in the shape of Pi's mcp.json entries. A project preset cannot use "auth".
        "mcpServers": {
          "github": { "url": "https://mcp.example.com/github" }
        }
      }
    },
    // Optional. Up to 100 profiles in each settings file. Omit it to add no profiles from this file.
    "profiles": [
      {
        // Required. Unique, 1 to 64 characters, without whitespace or control characters. "clear" is reserved.
        "name": "build",
        // Required. The text in the /profile list, up to 1,024 characters; profile change notices also send it to the model.
        "description": "Write and test code",
        // Optional. A provider/model-id reference. Omit it to keep the current model.
        "model": "anthropic/claude-sonnet-4-5",
        // Optional. off, minimal, low, medium, high, xhigh, or max. Pi limits it to what the model supports. Omit it to leave the level to Pi.
        "thinking": "medium",
        // Optional. Up to 32 MCP servers in the shape of Pi's mcp.json entries. Omit it to add no servers. They run only while this profile is selected. A project profile cannot use "auth".
        "mcpServers": {
          "tracker": { "url": "https://mcp.example.com/mcp" }
        },
        // Optional. Names of MCP presets from either settings file that a switch to this profile turns on, in place of the active ones. [] turns them all off. Omit it to keep the active presets.
        "mcpPresets": ["github"],
        // Optional. Tool names or * patterns, up to 256 in each list. Omit it to declare the tools that are declared without a profile.
        "tools": {
          // Optional. Tools that stop being declared until the model loads them with tool_search. A tool that the branch already used, or that tool_search cannot load again, stays declared. An array in the list is a group of tools that load together. Omit it to defer no tools.
          "defer": [["mcp__github__*"]]
        }
      },
      {
        "name": "plan",
        "description": "Read and plan without changing files",
        "model": "openai-codex/gpt-6.2-sol",
        "thinking": "high",
        // Optional. Up to 32 text files that are added to the system prompt, up to 1 MiB each. Omit it to add no text. A relative path resolves from the directory of the settings file: the agent directory or the project's .pi directory.
        "appendSystemPrompts": ["profiles/plan.md"],
        "tools": {
          // Optional. The tools to declare at the switch, before deny and defer apply. A defer list can also declare tool_search. Omit it to start from the tools that are declared without a profile.
          "allow": ["read", "grep", "find", "ls"],
          // Optional. Tools that stay off while the profile is selected, also when another extension turns them on. Omit it to deny no tools.
          "deny": ["edit", "write"]
        }
      }
    ]
  }
}
```

Here `~/.pi/agent/profiles/plan.md` contains the instructions for the `plan` profile, for example `Plan only. Do not change files.`

## Side effects

- pi-profiles replaces Pi's built-in `tool-search` extension with its own copy of `tool_search`, so Pi shows a warning at each start. Profiles work with or without the warning. To stop it, add `"-builtin:tool-search"` to `extensions` in `settings.json`. If you remove pi-profiles later, remove that entry too, or no `tool_search` is available, also for MCP servers with `deferred` exposure.
- Each switch adds a selection entry to the session file, and each MCP preset change adds an entry with the names of the active presets, and Pi records the model and thinking changes there. Profile changes also save [profile change notices](docs/switching.md#profile-change-notices) and, where needed, hidden run records; see [profiles across sessions](docs/sessions.md#restoration). pi-profiles writes no other files.
- A switch changes the system prompt or the declared tools, so the provider may not reuse its prompt cache for the next request.
- pi-profiles registers the MCP servers of the selected profile and the active presets with Pi, which starts their processes or connects to their URLs. pi-profiles makes no network requests itself.
- In the interactive terminal, when profiles are configured, pi-profiles replaces the editor with the same editor plus the profile name. It keeps the editor of an extension that loaded earlier. An extension that loads later and discards the earlier editor removes the profile name.
- In the interactive terminal, while MCP presets are active, pi-profiles sets a footer status that lists them; see [MCP presets](docs/tools.md#mcp-presets).

## Docs

| When you…                                                                             | Read                                                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Need the merge rules, every limit, or the warnings for invalid settings               | [Profile settings](docs/configuration.md)                |
| Want the exact effect of a switch, of no profile, or why a switch fails               | [Profile switches](docs/switching.md)                    |
| Use `*` patterns, `defer`, groups, MCP tools, or `tool_search`                        | [Profile tools](docs/tools.md)                           |
| Define MCP servers in a profile                                                       | [Profile MCP servers](docs/tools.md#profile-mcp-servers) |
| Turn sets of MCP servers on and off with any profile                                  | [MCP presets](docs/tools.md#mcp-presets)                 |
| Use the `/profile` menu and its tool states                                           | [Profile menu](docs/menu.md)                             |
| Resume, fork, use `/tree` or `/reload`, or start with a profile                       | [Profiles across sessions](docs/sessions.md)             |
| Change how a selection resolves, searches, or restores tools, or how MCP presets work | [Profiles internals](docs/internals.md)                  |
| Check what the tests protect                                                          | [Testing](docs/testing.md)                               |
| Upgrade Pi                                                                            | [Pi compatibility](docs/pi-compatibility.md)             |
