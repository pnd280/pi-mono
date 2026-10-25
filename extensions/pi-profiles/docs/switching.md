# Profile switches

[pi-profiles](../README.md)

A switch with **Alt+I**, `/profile`, or `--profile` applies a profile's fields to the current session only. For the `tools` field, read [profile tools](tools.md).

## Model and thinking level

- A profile with `thinking` sets that level, which Pi limits to what the model supports.
- Without `thinking`, pi-profiles does not set the level. A `model` change can still change it, because Pi then applies the level that its settings set for that model, or its default level. Without those settings, Pi keeps the current level, limited to what the model supports.

## Prompt texts

- pi-profiles reads the texts of `appendSystemPrompts` when settings load, so run `/reload` after you edit a file.
- pi-profiles trims each text and leaves out empty texts.
- pi-profiles joins the texts with a blank line (`\n\n`) and adds them after Pi's append text, such as `APPEND_SYSTEM.md`, `--append-system-prompt`, and changes from earlier extensions.
- In every load order, the texts follow the model-specific text of [pi-model-prompt](../../pi-model-prompt/README.md), which sees the profile's model.

## Repeated switches and no profile

- A switch to the current profile applies it again, for example after you edit settings and run `/reload`.
- No profile undoes the previous profile's tool changes and adds no texts. The model and the thinking level do not change.

## Editor border

- In the interactive terminal, the editor's top border shows the selected profile's name. With no profile, it shows no name.
- The name does not cover other text in the border, such as Pi's working status, so pi-profiles does not show it when the border is too narrow for both.

## When a switch does not apply

- pi-profiles refuses a switch while the agent runs, or while an earlier switch still waits for its model. Wait for the run to end, or stop it first.
- If the model is unknown or has no credentials, pi-profiles does not apply the profile and shows an error. This also applies when the model is already selected.
- Modes without a UI write the error to stderr.
- The credentials check is Pi's check for configured credentials: a key command or a stored login counts before a request uses it.

You cannot cancel a switch. A request, tree navigation, session replacement, and the end of the session wait until the switch is complete.

pi-profiles saves each switch in the session. Resume, `/fork`, `/tree`, and `/reload` use the branch's latest selection; read [sessions](sessions.md) for what each one restores.
