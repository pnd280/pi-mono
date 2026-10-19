# Profiles across sessions

[pi-profiles](../README.md)

pi-profiles saves each switch in the session, so a resumed, forked, or reloaded session keeps its profile.

## Restoration

- Each switch, also to no profile, saves the selection in the session. The model does not see it.
- Resume, `/fork`, and `/tree` use the latest selection on the branch: its texts are added, its tools are declared, and `tool_search` can load its deferred tools.
- If a request followed the switch, also one that did not change the tools, the tools of the last request are declared instead, so later changes, such as tools that `tool_search` loaded, stay.
- `/tree` to a branch with no selection and no recorded tools undoes the outgoing profile's tool changes.
- `/reload` keeps the selection and the declared tools.
- On `/reload`, Pi turns on again the `direct` and `model-only` extension tools that are active by default, as it does without profiles. pi-profiles then turns off again the tools that the selection turned off, unless a request after the switch declared them. So if you turn on such a tool after the last request, it turns off again, as on resume.
- Pi restores the model and the thinking level of the branch on resume and `/fork`, but not on `/tree`. After `/tree`, switch again to use the profile's model.

When pi-profiles no longer owns `tool_search`, restoration declares deferred tools again; see [tool search](tools.md#tool-search). When an MCP server still connects during restoration, the model can lose tools that it loaded from that server; see [MCP tools](tools.md#mcp-tools).

## Startup profile

- `--profile` applies when Pi starts, in every mode. It replaces the selection of a session that you open with `--continue`, `--resume`, `--session`, or `--fork`.
- Later sessions in the same run, for example after `/new` or `/resume`, keep their own selection. On a branch without a selection, `--profile` applies instead of `defaultProfile`.
- `defaultProfile` applies when an interactive session starts on a branch without a selection and without `--profile`, including resumed sessions from before you used profiles.
- No profile is a selection, so after `/profile clear` the default profile does not apply to that branch.
- At session start, pi-profiles applies the selection, `--profile`, or `defaultProfile` after the startup work of [pi-nested-instructions](../../pi-nested-instructions/README.md). So the selection entry follows its startup messages in every load order.
- A profile from `--profile` or `defaultProfile` replaces `--model` and `--thinking` choices for that session.
- Print, JSON, and RPC modes, including subagents, never apply `defaultProfile`. Without `--profile`, they keep the model and tools that they were given.

### With a `--tools` list

A profile from `--profile` or `defaultProfile` cannot declare a tool that a `--tools` list without `+` or `-` entries leaves out, because Pi does not register that tool. MCP tools are an exception: unless the list names an MCP tool, Pi keeps them for codemode and `tool_search`, and a profile can declare those that do not have `direct` exposure while `tool_search` is registered. A `--tools` list does not override `deny`: when a tool registers later, Pi turns on every tool that the list names again, and pi-profiles turns off the `deny` tools again.
