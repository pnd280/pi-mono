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

## Dialogs

Child dialogs appear in the supervisor with a `[subagent: <description>]` prefix. RPC clients answer them using Pi's [extension UI protocol](https://pi.dev/docs/latest/rpc-extension-ui).

## Limits

- A model can bypass extension depth limits by running Pi itself through `bash`.
- When a Node or Bun SDK host has no script file, children start with the `pi` command and without a shell. On Windows, this finds only a `pi.com` or `pi.exe`, not npm's `pi.cmd` shim.
- For how children stop and what a forced stop can leave behind, see [process shutdown](shutdown.md).
