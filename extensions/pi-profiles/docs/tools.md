# Profile tools

[pi-profiles](../README.md)

A profile's `tools` object decides which tools Pi declares to the model after a switch.

## Declared tools

A profile declares `allow`, or else the base tools, without the tools in `deny`. The base tools are the tools that are declared without a profile: before the first switch, the current tools; later, the current tools with the previous profile's additions and removals undone. Changes made after a switch, such as tools that `tool_search` loaded, stay in the base.

The `deny` tools stay off while the profile is selected, with the two limits below. When another extension, `tool_search`, or a `--tools` list turns one on again, pi-profiles turns it off before the next request: at the start of each run, and at the end of each turn. An extension that changes the tools at the start of a run after pi-profiles can still declare a denied tool for the first request. An extension that changes the tools at the end of a turn after pi-profiles can still declare a denied tool for the next request in that run. pi-profiles applies `allow` only at the switch, so other tools that turn on later stay.

At the same times, pi-profiles puts the declared tools in a fixed order: Pi's own tools, such as `read`, `bash`, and `codemode`, in Pi's order, then the other tools by name. So the order of the tools in the system prompt and the request does not depend on the order in which extensions load. This also applies without a profile.

## Patterns

Each entry in `allow`, `deny`, and `defer` is a tool name or a pattern in which `*` matches any characters, as in Pi's `--tools`. For example, `mcp__github__*` matches each tool of the `github` MCP server, and `*` matches every tool. A pattern in `allow` has these limits:

- As in `--tools`, a pattern in `allow` turns on only `direct` and `model-only` tools.
- A pattern in `allow` keeps the `codemode` and `deferred` tools that are base tools, such as tools that `tool_search` loaded. To declare another `codemode` or `deferred` tool, put its name in `allow`.
- A pattern in `allow` matches only the tools that are registered when you switch. For a tool that registers later, for example from an MCP server that connects later, switch again.
- Until you switch again, Pi decides whether a tool that registers later is declared; see [MCP tools](#mcp-tools).

## Deferred tools

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
- pi-profiles' `tool_search` does not find `deny` tools. Codemode scripts can still call denied `codemode` and `deferred` tools; see [MCP tools](#mcp-tools).
- Codemode scripts can call deferred `codemode` and `deferred` tools while `codemode` is declared, but not deferred `direct` or `model-only` tools.
- "Used" means that the model called the tool directly. Calls from codemode scripts do not count.
- pi-profiles ignores the names of tools that are not registered.
- The switch notice lists deferred tools apart from removed tools, and the tools of each change by name, for example `Profile review: tools added tool_search; deferred bash, edit`.

### Groups

An entry in `defer` can also be an array of names and patterns: a group. pi-profiles defers the tools of a group together, and `tool_search` loads them together:

```json
{ "tools": { "defer": ["mcp__linear__*", ["edit", "write"], ["mcp__github__*"]] } }
```

Here each Linear tool is deferred alone, but one search can load more than one of them. When the model loads `edit`, `tool_search` loads `write` too, and when the model loads one GitHub tool, `tool_search` loads all GitHub tools. This profile has no `allow`, so its entries match only the base tools.

- A tool belongs to the first `defer` entry that matches it. To keep a tool out of a group, put an entry that matches it before the group.
- A group is deferred only as a whole. If one of its tools stays declared, for example because the model used it, all its tools stay declared, also those that were not declared before the switch.
- Only pi-profiles' [tool search](#tool-search) loads a group together. A group with more than one tool stays declared when `deny` lists `tool_search`, or when another extension owns `tool_search`.
- A group contains only the tools that the profile would declare: `allow`, or else the base tools, without `deny`. It never contains `tool_search`, `hidden` tools, or tools that are not registered.
- `tool_search` loads no other tools as group tools, but it can still load a `codemode` or `deferred` tool that matches the query; see [MCP tools](#mcp-tools).
- The `tool_search` result names only the tools that match the query. The other tools of their groups are declared from the next request too.

### Codemode-only mode

While `codemode` is declared and `codemode.mode` is `"only"`, Pi leaves the active `direct` tools out of the model request. The codemode description lists them, and the model calls them from codemode scripts. Profiles change Pi's active tools, but they do not override this mode. The mode changes the effect of `defer`:

- After `tool_search` loads a deferred `direct` tool, the model can call it only from codemode scripts, because Pi hides its declaration.
- The `tool_search` result still says that the loaded tool is available from the next call.
- Each load of a deferred `direct` tool changes the codemode description, so Pi declares `codemode` again.
- Because Pi already hides `direct` declarations, deferral of a `direct` tool only removes it from the codemode description and from scripts.
- To remove a `direct` tool, use `deny`. To keep it for scripts, leave it out of `defer`.

## Tool search

pi-profiles registers its own `tool_search` while Pi loads extensions, also when no profile has a `defer` list. An extension cannot see the project trust decision while it loads, so it cannot tell whether a project profile has one. Pi then does not load its built-in `tool-search` extension; the README's [tool search](../README.md#tool-search) section tells how to stop the warning that Pi shows. The `tool_search` of pi-profiles is Pi's `tool_search`, built with Pi's own code: it has the same name, description, and search. It also finds the tools that the current profile deferred, and it loads the rest of their [groups](#groups) with them. Without deferred tools, it works as Pi's built-in `tool_search`.

- If pi-profiles no longer owns `tool_search`, for example because another extension now registers it, resume, `/tree`, `/fork`, and `/reload` declare again the `direct` and `model-only` tools that the session's selection deferred. They also declare each registered tool of its deferred groups, except `hidden` tools.
- If no registered, non-hidden `tool_search` is active, restoration declares all registered, non-hidden deferred tools, subject to Pi's tool restrictions.
- Only one extension can own `tool_search`. If another extension also registers it, Pi reports a conflict at startup.
- [pi-tool-display](../../pi-tool-display/docs/tools.md#tool-search-from-pi-profiles) shows its calls as it shows the calls of Pi's `tool_search`.

The search is Pi's:

- It searches the inactive tools with `codemode` or `deferred` exposure and the profile's deferred tools. It reads each tool's name, description, and parameter names and descriptions, and an MCP server's name, description, and instructions.
- It matches words, not meaning. For example, "shell" finds `bash`, but "terminal" does not.
- It loads up to `limit` matches (8 by default), and the other tools of their deferred groups. These group tools can make the total more than `limit`, and the result does not name them. For example, "edit a file" can match `edit`, `write`, `read`, and `bash`, because each description contains "file".
- The model does not see deferred tools until it searches, and codemode does not list deferred `direct` tools. Tell the model what to search for in a file in `appendSystemPrompts`, for example `To run shell commands, load bash with tool_search.`

## MCP tools

Pi names each MCP tool `mcp__<server>__<tool>`. It replaces each character other than a letter, a digit, or `_` with `_`. Pi shortens a name longer than 64 characters, or a name that another tool has, and adds a hash at the end. Profiles take these names, or patterns such as `mcp__github__*`; see [patterns](#patterns). The tool's [exposure](https://pi.dev/docs/latest/mcp#control-tool-exposure) decides what a profile can change:

| Exposure                           | Effect of `allow` and `deny`                                                                                                                                                                                       | Effect of `defer`                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `direct`                           | They decide whether the model can call the tool.                                                                                                                                                                   | It applies through pi-profiles' [tool search](#tool-search). |
| `codemode` (default) or `deferred` | They decide only whether the tool is declared. Only its name in `allow` declares it; see [patterns](#patterns). Codemode scripts can still call it, and `tool_search` can declare it again unless `deny` lists it. | It applies.                                                  |
| `hidden`                           | None; the tool is unreachable.                                                                                                                                                                                     | None.                                                        |

To make a tool unavailable in every profile, give it `hidden` exposure in Pi's MCP configuration.

Pi's MCP support also changes the declared tools by itself, so the profile does not always decide them:

| Case                                                                                                                                                   | What happens                                                                                                                                                                                                                                 | What to do                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A server connects or adds tools after a switch. At startup this is usual, because servers connect in the background.                                   | Pi declares the new `direct` tools, whatever `allow` and `defer` say. pi-profiles turns off the `deny` tools again; see [declared tools](#declared-tools).                                                                                   | Switch again after the server connects.                                 |
| `allow` names a tool of a server that has not connected yet.                                                                                           | pi-profiles ignores the name. Pi declares a `direct` tool when it appears, as above; a `codemode` or `deferred` tool stays undeclared.                                                                                                       | Switch again after the server connects.                                 |
| `allow` omits `codemode` or `tool_search`, or `defer` lists `codemode`.                                                                                | When a session starts, when the server list changes, after a sign-in, and after `/mcp` actions such as reconnect, Pi declares `codemode` again for servers with `codemode` exposure, and `tool_search` for servers with `deferred` exposure. | Switch again after these events. To keep them off, list them in `deny`. |
| You resume, fork, or reload a session while a server is still connecting, and pi-profiles changes the tools at that time; see [sessions](sessions.md). | If the change turns off a tool, tools that the model loaded from that server with `tool_search` disappear.                                                                                                                                   | The model can load them again with `tool_search`.                       |
