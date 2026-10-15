# When the replacement applies

[pi-model-prompt](../README.md)

A matching rule replaces Pi's append text only in some cases. Read this guide when you also pass append text from another source, or when you use a virtual model.

## Explicit append text

The extension replaces the append text only when it equals Pi's discovered `APPEND_SYSTEM.md` (or is empty when there is none). Text from `--append-system-prompt` or another extension is left alone when it differs. If it happens to be identical, it can't be told apart and may be replaced.

## Virtual models

Rules match the selected model. For a [virtual model](https://pi.dev/docs/latest/virtual-models), that is its own `provider/id`, such as `router/auto`, never the physical model it routes to.

- A rule matching the virtual ID applies its files to every request, whichever model the router picks.
- Rules for physical models, such as `^anthropic/`, don't apply under a virtual model.
- The prompt stays the same for the whole run, even when the router switches models between requests.

Pi builds the prompt once per run, before routing, and offers extensions no provider-neutral way to change it per request afterwards.
