# Child processes

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

Each [task](../GLOSSARY.md#tasks-and-processes) run starts a [child](../GLOSSARY.md#tasks-and-processes): a separate Pi process in RPC mode. A child is a full Pi session, not a sandbox. It starts with a fresh conversation, so the `prompt` must supply the context that it needs.

## What a child inherits

- Children have normal Pi tools and permissions. A research prompt does not make a child read-only, and there is no workspace isolation.
- Children inherit the environment, working directory, and project-trust decision.
- Children load their own configured extensions and tools. When Pi reports an absolute source path for this package, children also load it through `-e`; otherwise, their settings must load it.
- A child whose settings load another copy of the package fails to launch.
- Other supervisor CLI flags, including the supervisor's own `-e`, `--tools`, `--session-dir`, and `--no-session`, are not forwarded.

Because a child loads its own extensions, a model that an extension registers is available to it only under the conditions in [model and thinking](tasks.md#model-and-thinking).

## Result instructions

The supervisor receives only the child's final reply. Each child's system prompt therefore tells the child this, and asks for a final reply that gives the outcome first, then evidence as file paths with line numbers or as commands and their results, and then what the child did not verify or finish. The [child prompt](../src/child/prompt.ts) holds the exact text.

- The instructions follow the text from Pi and `--append-system-prompt`, and the [pi-model-prompt](../../pi-model-prompt/README.md) and [pi-profiles](../../pi-profiles/README.md) prompts.
- The top-level supervisor's system prompt does not get them.
- An extension in the child that replaces the whole system prompt also removes them.

## Dialogs

Child dialogs appear in the supervisor with a `[subagent: <description>]` prefix. RPC clients answer them using Pi's [extension UI protocol](https://pi.dev/docs/latest/rpc-extension-ui).

## Limits

- A model can bypass extension depth limits by running Pi itself through `bash`.
- When a Node or Bun SDK host has no script file, children start with the `pi` command and without a shell. On Windows, this finds only a `pi.com` or `pi.exe`, not npm's `pi.cmd` shim.
- For how children stop and what a forced stop can leave behind, see [process shutdown](shutdown.md).
