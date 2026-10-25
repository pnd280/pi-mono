# Subagent tool docs

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

Use the [`docs`](../README.md#configuration) setting to tell the model how to use the `subagent` tool, for example when to delegate or what each prompt must contain.

The built-in description states only how tasks work: the supervisor receives only the final message, each new task starts with a fresh conversation, children share the working directory, and `task_id` continues a task. It sets no rule for when to delegate. The workspace's [delegation file](../../../../.resources/pi-subagents/delegation.md) is an example of such a rule.

## Where the text appears

The text goes into the tool's description, so it accompanies the current tool declaration:

- When another extension defers the tool and loads it later, the docs arrive with the tool.
- When the tool is hidden, for example at `maxDepth`, the current tools have no docs.
- Hiding or replacing the tool does not erase descriptions already recorded in conversation history.
- `subagent_abort` gets no docs.

## How files are read

- A leading `~` expands to the home directory. Other relative paths resolve against the directory of the settings file that lists them.
- Each file is trimmed. The files follow the built-in description in list order, separated by a blank line.
- Each file must be a regular file of at most 1 MiB. Run `/reload` after you edit one.
- A trusted project's `docs` replaces the global list, and an empty array removes the docs.

A file that cannot be read is left out, and the other files still apply. An invalid `docs` value is ignored for its settings file. Both problems produce UI warnings when settings load. Print and JSON modes show no warnings.
