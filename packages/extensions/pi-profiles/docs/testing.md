# Profiles test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests the trust boundary for project settings, what a switch declares and appends, `*` patterns, the deferral rules and groups, the extension's `tool_search` without deferrals, restoration on each branch, which file chooses the default profile, and where `--profile` and the default profile apply. Pi owns model and thinking persistence, tool restoration from the transcript, and project-trust resolution.

## Must not regress

- **Critical, e2e:** Project settings supply or replace profiles, and choose the default profile, only in trusted projects. In a trusted project, a project profile replaces the global profile with its name, and the other global profiles stay.
- **High, e2e:** In a trusted project, a project `defaultProfile` replaces the global one. An invalid project value, also `null`, selects no default profile; it does not fall back to the global value.
- **High, e2e:** A switch sets the profile's model and thinking level and declares `allow`, or the tools active without the previous profile, minus `deny`. A `*` pattern in these lists matches the registered tools. Later requests add the texts of the profile's prompt files after the existing `appendSystemPrompt` text. The next switch, also to no profile, undoes the previous profile's tool changes, and no profile adds no prompts.
- **High, e2e:** A `defer` tool of any exposure except `hidden` stops being declared only when the branch has not used it and a declared `tool_search` can load it again. A profile that defers `direct` or `model-only` tools declares `tool_search`, which loads them but not the profile's `deny` tools of those exposures. Another extension's `tool_search` cannot load them, so they stay declared, also after restoration. A trusted project profile's `defer` list works as a global one does.
- **High, e2e:** Without deferred tools, the extension's `tool_search` loads the `codemode` and `deferred` tools that Pi's built-in `tool_search` loads, because it replaces the built-in for every user.
- **High, e2e:** A tool belongs to the first `defer` entry that matches it. A name or pattern entry defers each tool that it matches on its own, so `tool_search` loads that tool alone. A `defer` group is deferred only as a whole: when one of its tools is declared and the branch used it, all its tools stay declared. When the extension's `tool_search` loads one of its tools, it loads the others too, also after resume. With another extension's `tool_search`, a switch and a restoration declare all tools of a group that has two or more tools.
- **High, e2e:** After tree navigation and resume, the branch's latest selection decides the added prompts. It decides the declared tools when no request followed it, also after a compaction; otherwise the tools of the last request stay. `/reload` keeps the declared tools, but does not turn on again the tools that the selection turned off.
- **High, e2e:** When Pi starts, `--profile` applies in every mode and replaces a resumed branch's selection. Otherwise, the default profile applies only when an interactive session starts on a branch without a selection, and a switch to no profile counts as a selection. Without `--profile`, print, JSON, and RPC sessions keep the model and tools they were given.

## Not tested

- The shortcut, its cycle order, the `/profile` menu and its details, the profile name in the editor border, and notice wording are convenience behaviour. The menu switches through the tested switch path.
- Other settings recovery, limits, and warnings are below the severity bar; warnings contain no supplied values.
- A profile whose model cannot be selected, and a `--profile` that names no profile, are reported with an error; the user sees the refusal. Modes without a UI write the error to stderr.
- In later sessions of the same run, such as after `/new`, `--profile` applies instead of the default profile on a branch without a selection. The tests cover startup, where `--profile` matters most.
- A switch while the agent runs, or while an earlier switch waits for its model, is refused with a warning. If it were applied, the switch notice would show it; see the manual checks. A request sent during a switch waits for it; this needs a slow model change. `/profile clear` still works after all profiles were removed from settings.
- The [MCP tool cases](../README.md#mcp-tools) depend on Pi's MCP support and on server timing; Pi owns them, and the [compatibility checklist](pi-compatibility.md#mcp-tools) covers them.
- `hidden` exposure: `tool_search` does not offer a deferred tool that later became `hidden`, and a `hidden` `tool_search` does not count as declared or as the extension's. Only an unusual configuration has these cases.
- On `/reload`, a tool that the selection turned off and a later request declared stays declared. The tests cover the more common case, in which `/reload` must not turn on a tool that the selection turned off.

## Manual checks

Add two profiles to `~/.pi/agent/settings.json`, and run `pi` from the workspace root.

| Do                                                                                                                                         | Expect                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Run `pi --profile <name>`.                                                                                                                 | The editor's top border shows the profile name.                                                                                      |
| Press **Alt+I** three times.                                                                                                               | The presses select each profile, then no profile, and show the tool changes.                                                         |
| Look at the editor's top border after each press.                                                                                          | Its right end shows the profile name, and no name for no profile.                                                                    |
| Start a response, and look at the editor's top border.                                                                                     | Pi's working status and the profile name both show.                                                                                  |
| Press **Alt+I** while a response streams.                                                                                                  | A warning; the profile does not change.                                                                                              |
| In a terminal with 26 rows, run `/profile`, press **Tab**, and select `tool_search`.                                                       | The list stays usable; the details below it end with `…`.                                                                            |
| Run `/profile` and choose a profile, then `clear`.                                                                                         | The menu marks the current profile, and lists `clear`; each choice applies.                                                          |
| In the `/profile` menu, select a profile that removes tools.                                                                               | The details below the list show the tool lists, the prompts, and the tool change of a switch.                                        |
| In the menu, press **Tab**, then select a deferred tool.                                                                                   | The tools show their states and counts; the details say that `tool_search` can load it.                                              |
| In a new session where `bash` is declared and not used, switch to a profile that defers `bash`, and ask the model to run a shell command.  | The notice lists `bash` as deferred; the model loads it with `tool_search` and runs it.                                              |
| Switch to a profile with the `defer` group `["edit", "write"]`, ask the model to change a file, then press **Tab** in the `/profile` menu. | After the model loads `edit`, the menu shows `edit` and `write` as declared, also when the `tool_search` card does not name `write`. |
