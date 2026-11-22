# Profile switches

[pi-profiles](../README.md)

A switch with **Alt+I**, `/profile`, or `--profile` applies a profile's fields to the current session only. For the `tools` field, read [profile tools](tools.md).

## Model and thinking level

- A profile with `thinking` sets that level. When the model does not support the level, Pi uses the nearest higher level that it supports, or else the nearest lower one, without a warning. For example, GPT-6.2 Sol supports neither `off` nor `minimal` on the `openai` and `azure` providers, so both run as `low`. On `openai-codex`, it does not support `off`, so `off` runs as `minimal`.
- Without `thinking`, pi-profiles does not set the level. A `model` change can still change it, because Pi then applies the level that its settings set for that model, or its default level. Without those settings, Pi keeps the current level, limited to what the model supports.

## Prompt texts

- pi-profiles reads the texts of `appendSystemPrompts` when settings load, so run `/reload` after you edit a file.
- pi-profiles trims each text and leaves out empty texts.
- pi-profiles joins the texts with a blank line (`\n\n`) and adds them after Pi's append text, such as `APPEND_SYSTEM.md`, `--append-system-prompt`, and changes from earlier extensions.
- In every load order, the texts follow the model-specific text of [pi-model-prompt](../../pi-model-prompt/README.md), which sees the profile's model.

## MCP servers

- Only the selected profile's servers are registered. A switch registers the profile's servers and unregisters the servers of the previous profile. No profile (`/profile clear`) unregisters all of them. Unregistering a server closes its connection, and its tools become unreachable.
- A server whose name and entry stay the same across a switch keeps its connection. A server with a changed entry reconnects.
- When settings load, pi-profiles checks only that each entry is an object. Pi checks the name and the entry when pi-profiles registers the server at a switch. If Pi refuses a server (an invalid entry, or a name that another extension registered), pi-profiles shows an error (or writes it to stderr in modes without a UI), and the switch applies without that server.
- The switch notice does not change; the [`/profile` menu](menu.md#profiles-view) shows each profile's servers. For how registered servers connect and how their tools work with `tools` and `mcp.json`, read [profile MCP servers](tools.md#profile-mcp-servers).

## Repeated switches and no profile

- A switch to the current profile applies it again, for example after you edit settings and run `/reload`.
- No profile undoes the previous profile's tool changes, adds no texts, and unregisters the previous profile's MCP servers. The model and the thinking level do not change.

## Profile change notices

When the effective profile changes after at least one run has happened on the branch, the next run appends one `pi-profiles.notice` custom message after its starting message so the model knows its active profile changed:

- The branch's first run adds no notice, including when a session starts with `defaultProfile`, `--profile`, or a switch before the first prompt.
- Several switches while idle produce one notice for the net change, and switching away and back to the same profile adds no notice.
- Re-applying the same profile from the same settings scope adds no notice.
- Switching to a profile includes its trimmed description when non-empty. When the outgoing and incoming profiles share a name across scopes, the notice names each scope (`global` or `project`).
- Clearing the profile reports that it was cleared, as does a switch to a profile that the settings no longer supply at the next run. When the previously active profile is still selected but no longer configured, or its project is untrusted, the next run reports that it was deactivated because it is no longer available; if it becomes available again later, the next run reports it as active.
- The profile of a run stays with its response. After `/tree` or `/fork` to a prompt, or `/tree` to a notice, the next run compares with the run before that prompt.
- When [pi-tool-display](../../pi-tool-display/README.md) is loaded, each notice renders as a compact row that wraps in narrow terminals (`• Profile build → plan`, `• Profile plan`, `• Profile cleared (was plan)`, or `• Profile unavailable (was plan)`). Without it, Pi shows the full notice text in its default custom-message box.

## Editor border

- In the interactive terminal, the editor's top border shows the selected profile's name. With no profile, it shows no name.
- The name does not cover other text in the border, such as Pi's working status, so pi-profiles does not show it when the border is too narrow for both.

## When a switch does not apply

- pi-profiles refuses a switch while the agent runs, or while an earlier switch still waits for its model. Wait for the run to end, or stop it first.
- If the model is unknown or has no credentials, pi-profiles does not apply the profile and shows an error. This also applies when the model is already selected.
- Modes without a UI write the error to stderr.
- The credentials check is Pi's check for configured credentials. A key command or a stored login counts as configured, and the check does not run the command or refresh the login.

You cannot cancel a switch. A request, tree navigation, session replacement, and the end of the session wait until the switch is complete.

pi-profiles saves each switch in the session. Resume, `/fork`, `/tree`, and `/reload` use the branch's latest selection; read [sessions](sessions.md) for what each one restores.
