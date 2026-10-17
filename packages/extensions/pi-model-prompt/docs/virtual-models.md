# Rules under virtual models

[pi-model-prompt](../README.md)

Rules match the selected model. For a [virtual model](https://pi.dev/docs/latest/virtual-models), that is its own `provider/id`, such as `router/auto`, never the physical model it routes to.

- A rule matching the virtual ID adds its files to every request, whichever model the router picks.
- Rules for physical models, such as `^anthropic/`, don't apply under a virtual model.
- The prompt stays the same for the whole run, even when the router switches models between requests.

The extension selects its files once per run, before routing. The same files therefore apply to every physical model that the run uses.
