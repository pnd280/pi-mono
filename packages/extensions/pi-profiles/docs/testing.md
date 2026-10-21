# Profiles test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests the trust boundary for project settings, what a switch declares and appends, `*` patterns, deferral and groups, `deny` against later tool changes, restoration on each branch, and where `--profile` and the default profile apply, and Pi owns model and thinking persistence, tool restoration from the transcript, and project-trust resolution.

## Must not regress

### Settings

- **Critical, e2e:** Project settings supply or replace profiles, and choose the default profile, only in trusted projects.
- **Critical, e2e:** In a trusted project, a project profile replaces the global profile with its name, and the other global profiles stay.
- **High, e2e:** In a trusted project, a project `defaultProfile` replaces the global one.
- **High, e2e:** In a trusted project, an invalid project `defaultProfile` value, also `null`, selects no default profile and does not fall back to the global value.
- **High, e2e:** A trusted project profile's `defer` list works as a global one does.

### Switching

- **High, e2e:** A switch sets the profile's model and thinking level.
- **High, e2e:** A switch declares `allow`, or the tools active without the previous profile, minus `deny`.
- **High, e2e:** A `*` pattern in `deny` matches the registered tools.
- **High, e2e:** A pattern in `allow` matches the registered `direct` and `model-only` tools and the base tools, so it does not turn on `codemode` or `deferred` tools.
- **High, e2e:** Later requests add the texts of the profile's prompt files after the existing `appendSystemPrompt` text.
- **High, e2e:** The next switch, also to no profile, undoes the previous profile's tool changes.
- **High, e2e:** No profile adds no prompts.
- **High, e2e:** No request of the selection declares a `deny` tool when an extension that loads earlier turns it on before or during a run, or when a later registration makes `--tools` turn it on again.

### Deferral

- **High, e2e:** A `defer` tool of any exposure except `hidden` stops being declared only when the branch has not used it and a declared `tool_search` can load it again.
- **High, e2e:** A profile that defers `direct` or `model-only` tools declares `tool_search`.
- **High, e2e:** The extension's `tool_search` loads deferred `direct` and `model-only` tools, but not the profile's `deny` tools of those exposures.
- **High, e2e:** With another extension's `tool_search`, deferred `direct` and `model-only` tools stay declared, also after restoration.
- **High, e2e:** Without an available `tool_search`, restoration declares all registered, non-hidden deferred tools again.
- **High, e2e:** Without deferred tools, the extension's `tool_search` loads the `codemode` and `deferred` tools that Pi's built-in `tool_search` loads, because it replaces the built-in for every user.

### Groups

- **High, e2e:** A tool belongs to the first `defer` entry that matches it.
- **High, e2e:** A name or pattern entry defers each tool that it matches on its own, so `tool_search` loads that tool alone.
- **High, e2e:** A `defer` group is deferred only as a whole: when one of its tools is declared and the branch used it, all its tools stay declared.
- **High, e2e:** When the extension's `tool_search` loads one tool of a group, it loads the others too, also after resume.
- **High, e2e:** With another extension's `tool_search`, a switch and a restoration declare all tools of a group that has two or more tools.

### Restoration

- **High, e2e:** After tree navigation and resume, the branch's latest selection decides the added prompts.
- **High, e2e:** A switch that waits for its model saves its selection before tree navigation moves to another branch or a same-file resume reads the session.
- **High, e2e:** Navigation to a branch with neither a selection nor recorded tools undoes the outgoing profile's tool changes.
- **High, e2e:** The selection decides the declared tools when no request followed it, also after a compaction. Otherwise the tools of the last request stay.
- **High, e2e:** `/reload` keeps the declared tools, but does not turn on again the tools that the selection turned off.

### Startup

- **High, e2e:** When Pi starts, `--profile` applies in every mode and replaces a resumed branch's selection.
- **High, e2e:** Without `--profile`, the default profile applies only when an interactive session starts on a branch without a selection.
- **High, e2e:** A switch to no profile counts as a selection, so the default profile does not apply to that branch.
- **High, e2e:** Without `--profile`, print, JSON, and RPC sessions keep the model and tools they were given.

## Not tested

- The shortcut, its cycle order, the `/profile` menu and its details, the profile name in the editor border, and notice wording are below the severity bar. The menu switches through the tested switch path.
- Other settings recovery, limits, and warnings are below the severity bar. Warnings contain no supplied values.
- The error for a profile whose model cannot be selected, and for a `--profile` that names no profile, is below the severity bar, because the user sees the refusal.
- `--profile` in later sessions of the same run, such as after `/new`, is not tested because the tests cover startup, where `--profile` matters most.
- The refusal of a switch while the agent runs, or while an earlier switch waits for its model, is below the severity bar, because a wrong switch would show in the switch notice; see the manual checks.
- A request that waits for a switch is not tested because the test needs a slow model change.
- `/profile clear` after all profiles were removed from settings is below the severity bar.
- Pi owns the [MCP tool cases](tools.md#mcp-tools), which depend on its MCP support and on server timing. The [compatibility checklist](pi-compatibility.md#mcp-tools) covers them.
- The fixed tool order with `deny` tools is below the severity bar. It decides the order of the tool guidelines in the system prompt and of the tools in the request, which would otherwise follow the load order.
- The `deny` filter of the extension's `tool_search` list is below the severity bar.
- The libs [prompt-parts](../../../libs/src/prompt-parts/README.md) and [lifecycle](../../../libs/src/lifecycle/README.md) coordinators own the rank order, the holds, the startup barrier, and the shortcut claims, which place the profile's prompts and selection entry relative to other extensions.
- The `hidden` exposure cases are below the severity bar, because only an unusual configuration has them: `tool_search` does not offer a deferred tool that later became `hidden`, and a `hidden` `tool_search` does not count as declared or as the extension's.
- A tool that the selection turned off and a later request declared stays declared on `/reload`. This case is not tested because the tests cover the more common case, in which `/reload` must not turn on a tool that the selection turned off.

## Manual checks

Add two profiles to `~/.pi/agent/settings.json`, and run `pi` from the workspace root.

| Do                                                                                                                                         | Expect                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run `pi --profile <name>`.                                                                                                                 | The editor's top border shows the profile name.                                                                                                           |
| Press **Alt+I** three times, and look at the editor's top border after each press.                                                         | The presses select each profile, then no profile, and show the tool changes. The border's right end shows the profile name, and no name for no profile.   |
| Start a response, and look at the editor's top border.                                                                                     | Pi's working status and the profile name both show.                                                                                                       |
| Press **Alt+I** while a response streams.                                                                                                  | pi-profiles shows a warning, and the profile does not change.                                                                                             |
| In a terminal with 26 rows, run `/profile`, press **Tab**, and select `tool_search`.                                                       | The list shows its rows, and the details below it end with `…`.                                                                                           |
| Run `/profile` and choose a profile, then `clear`.                                                                                         | The menu marks the current profile and lists `clear`. After each choice, the editor's top border shows the chosen profile's name, or no name for `clear`. |
| In the `/profile` menu, select a profile that removes tools.                                                                               | The details below the list show the tool lists, the prompts, and the tool change of a switch.                                                             |
| With `codemode.mode` set to `"only"`, open the Tools view and select an active direct tool.                                                | The tool is labelled `active`; the details explain that codemode can hide its declaration.                                                                |
| With an earlier editor whose border contains a hyperlink, select a profile.                                                                | The profile name does not inherit the border's hyperlink.                                                                                                 |
| In the menu, press **Tab**, then select a deferred tool.                                                                                   | The tools show their states and counts; the details say that `tool_search` can load it.                                                                   |
| In a new session where `bash` is declared and not used, switch to a profile that defers `bash`, and ask the model to run a shell command.  | The notice lists `bash` as deferred; the model loads it with `tool_search` and runs it.                                                                   |
| Switch to a profile with the `defer` group `["edit", "write"]`, ask the model to change a file, then press **Tab** in the `/profile` menu. | After the model loads `edit`, the menu shows `edit` and `write` as active, also when the `tool_search` card does not name `write`.                        |
