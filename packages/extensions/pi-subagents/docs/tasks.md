# Continue and cancel tasks

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

A [task](../GLOSSARY.md#tasks-and-processes) keeps its ID for its whole life. The supervisor model uses that ID to send input to a running task, resume a finished task, or cancel a task whose result it no longer needs.

## Send input or resume

Set `task_id` in a `subagent` call to continue a task with its earlier conversation. An inactive task resumes; an active task receives input and returns immediately. IDs appear in tool results and `/subagents list`. Only the supervisor model sends task input.

- Use `delivery: "follow_up"` (the default) to add input after the current work, or `delivery: "steer"` to deliver it before the next model request.
- Input to an active task uses only `prompt` and `delivery`. When the call also sets `model`, `thinking`, `background`, or `launch_args`, the result starts with a warning line that names the ignored fields.
- A launch or resume ignores `delivery`. When the call sets it, the result starts with a warning line.
- Active-task input uses the existing capacity slot and result destination, and reports no additional usage.
- When input continues a run after a final reply, the run's result contains that reply before the later replies.
- Active descendant input is routed to its supervisor.
- Only the supervisor that launched a task can resume it, so inactive descendants are read-only.

A resume continues the task's latest run on the selected ancestry. For what the resumed run contains, see [resume](history.md#resume).

## Model and thinking

For a new task, an omitted `model` or `thinking` uses the value of the call's [template](#templates) when the template sets one, and otherwise the supervisor's current selection. A model override uses `provider/id`; Pi resolves it and the provider validates availability.

The child resolves the model with the extensions that it loads itself; see [what a child inherits](children.md#what-a-child-inherits). A [virtual model](https://pi.dev/docs/latest/virtual-models), or another model that an extension registers, is available to a child only when the child loads that extension: through its settings, or through `-e <path>` in [`launch_args`](#launch-arguments). This also applies when the supervisor's current selection is a virtual model. The extension does not forward the supervisor's CLI flags, such as `-e`, or models that SDK code registers. Without one of these loads, such a model is not available to the child:

- An unknown provider, such as `router/auto`, fails the launch.
- An ID under a known provider, such as `openai-codex/auto`, can reach that provider as an unlisted model ID.

On resume, each omitted value repeats the value that the task's latest run requested, so later changes to the supervisor's selection do not apply. For example, a run that requested `high` on a model without thinking levels applies `off`, and a resume that selects a reasoning model requests `high` again.

A task shows its requested selection while queued, then the child's resolved model and clamped thinking level at launch. Each response that did not fail supplies the physical model and thinking level. The panel follows these updates; a tool card stops updating when its call returns.

## Launch arguments

Set `launch_args` to an array of more Pi CLI arguments for the child, such as `["--no-extensions", "-e", "path"]`. The array has at most 32 items, and each item has at most 2,048 characters.

- The arguments come after the arguments that start Pi and before the flags that the extension sets: `--mode`, `--model`, `--thinking`, `--approve` or `--no-approve`, `--extension`, and `--session`. When Pi reads a flag two times, the extension's flag wins.
- A call fails before it starts a task when an item is a flag that another parameter owns: `--model` and `--provider` (`model`), `--thinking` (`thinking`), and `--session`, `--session-id`, `--no-session`, `--fork`, `-c`, `--continue`, `-r`, and `--resume` (`task_id`). The check also finds the `--flag=value` form. It also rejects a value that is equal to one of these flags. The error names the flag.
- A call also fails before it starts a task when the last item is a Pi flag that always takes the next argument, such as `--append-system-prompt` or `-e`. Pi would take the extension's `--mode` as its value, and the child would not start RPC.
- The extension does not check other arguments. Pi rejects an unknown option, and the launch then fails.
- On resume, an omitted `launch_args` repeats the value that the task's latest run requested. An array replaces it, and `[]` removes it.

## Templates

A [template](../GLOSSARY.md#tasks-and-processes) gives the default launch values for a new task. Set `template` in a `subagent` call to the name of a template from the [`templates`](../README.md#configuration) setting. The `subagent` description lists each template with its `description` and the `model`, `thinking`, `background`, and `launchArgs` that it sets. For the position of the list in the description, see [how docs files are read](tool-docs.md#how-files-are-read). The list does not show the prompt files. Without templates, the description has no list.

### Template settings

| Field                 | Required | Effect                                                                                                                                                                                                           |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name (the key)        | Yes      | A lowercase letter, then lowercase letters, digits, or hyphens.                                                                                                                                                  |
| `description`         | Yes      | Tells the model when to use the template, with at least one character that is not white space. It is not the task label, which is the call's `description`.                                                      |
| `model`               | No       | The default model, as `provider/id`.                                                                                                                                                                             |
| `thinking`            | No       | The default thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.                                                                                                                        |
| `background`          | No       | The default value of the call's `background`.                                                                                                                                                                    |
| `launchArgs`          | No       | Pi CLI arguments that every call of the template adds. At most 32 items of at most 2,048 characters, with the same rejected flags as [`launch_args`](#launch-arguments).                                         |
| `appendSystemPrompts` | No       | Files that the child adds to its system prompt. At most 32 items of at most 2,048 characters. A leading `~` expands to the home directory, and a relative path resolves from the directory of the settings file. |

- Templates from global settings and from trusted project settings combine. For the same name, the project template replaces the global template completely; its fields are not merged.
- A `templates` value that is not an object is ignored for its settings file, with a warning.
- Run `/reload` after you change a template. Pi reads the prompt files when each child starts, so a change to the text of a prompt file needs no `/reload`. When a file no longer exists, Pi adds its path as text.

A template is left out in these cases:

- It has an unknown field, an invalid value, or an invalid name.
- Its `launchArgs` has a rejected argument.
- A prompt file cannot be read when settings load. A prompt file must be a regular UTF-8 file of at most 1 MiB. Run `/reload` after you correct the file.

The UI then shows a warning that names the template and its settings file. A project template that is left out does not replace the global template of the same name.

### What a call receives

- For `model` and `thinking`, see [model and thinking](#model-and-thinking). The call's `background` replaces the template's value; when neither sets it, the task runs in the foreground.
- The child's launch arguments are, in this order: the call's `launch_args`, the template's `launchArgs`, and a `--append-system-prompt <absolute path>` pair for each prompt file. The extension's own flags follow them. The template's part comes last, so that the template's value wins for a flag that Pi reads once. This also applies to a flag that the check below does not know, such as a flag that another extension registers.
- Pi expands a leading `~/` only in the values of `-e`, `--skill`, `--prompt-template`, `--theme`, and `--session-dir`. It resolves relative paths in the values of the first four from the child's working directory. No part of the extension or Pi expands `$VAR`, because the child starts without a shell. Use absolute paths in other values.
- A nested child reads the same global and project settings with the supervisor's trust decision, so it has the same templates.

A call fails before it starts a task in these cases:

- The name is not a configured template. The error lists the valid names.
- The call also sets `task_id`. A template applies only to a new task.
- The call's `launch_args` sets a flag that takes one value and that the template's `launchArgs` also sets. The error names the flag and the template. The check covers these flags:
  - `--api-key`
  - `--system-prompt`
  - `--name` or `-n`
  - `--session-dir`
  - `--models`
  - `--tools` or `-t`
  - `--exclude-tools` or `-xt`
  - `--export`

The check does not cover flags that Pi collects, such as `-e`. Their values add to the template's values.

The task does not keep the template name. It keeps the resolved model, thinking level, and launch arguments; for where they appear, see [task card details](interface.md#task-card-details) and the fields of [task pages](commands.md#task-pages).

A resume uses the rules of [model and thinking](#model-and-thinking) and [launch arguments](#launch-arguments). These rules also apply to the template's arguments and prompt files. A resume does not repeat `background`, so set it again to resume a task in the background.

## Cancel a task

The model calls `subagent_abort` with a `task_id` when an active owned task's result is no longer necessary. This includes owned descendants.

A successful call returns a confirmation, and the model receives no separate `cancelled` result. An intermediate supervisor still receives the result of its own child. The task session remains resumable.

If the task finished before cancellation, the call reports an inactive task and preserves its actual result. If the task stops but the [forced stop](shutdown.md) of its processes or of a process in its subtree fails, the call reports that error instead of a confirmation, and the task's `cancelled` result also names the error. The owning supervisor confirms descendant cancellation, and its errors reach the caller.

For how the child process then stops, see [process shutdown](shutdown.md).

## Turn aborts

Aborting the supervisor's turn immediately force-stops its running foreground subtrees. It also cancels the calls that have not returned: queued calls, and background calls whose child has not started.

Background tasks survive turn aborts after their call returns. Tree navigation, parent-session fork, and session switch stop them too; see [branch changes](history.md#branch-changes).

## Task counter

With [pi-agent-summary](../../pi-agent-summary/README.md#counters), the run summary shows `delegated N tasks`. Each call that starts a task run, new or resumed, counts once; input to an active task, rejected calls, and queued calls cancelled before they start do not. Each descendant counts only in its own session.
