# Rules under virtual models

[pi-model-prompt](../README.md)

Rules match the selected model. A [virtual model](https://pi.dev/docs/latest/virtual-models) is a selectable model that picks a physical model for each request. For a virtual model, the selected model is its own `provider/id`, such as `router/auto`, never the physical model it routes to. The extension selects its files once per run, before routing.

- A rule matching the virtual ID adds its files to every request, whichever model the router picks.
- A rule that matches only the routed physical model's ID doesn't apply. A provider-wide pattern such as `^anthropic/` still matches a virtual model listed under that provider, such as `anthropic/auto`.
- The prompt stays the same for the whole run, even when the router switches models between requests. The same files apply to every physical model that the run uses.
