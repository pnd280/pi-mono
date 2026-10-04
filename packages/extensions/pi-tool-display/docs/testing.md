# Tool-display test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Glossary](../GLOSSARY.md)

This package tests settings trust, delegated execution through its private Pi host access, saved display facts, and hook ownership across reload and disposal. Libs and utils own shared budgets and algorithms; producers own their result contracts, such as [`pi-read/result`](../../pi-read/docs/result.md). The [API](../src/host/install.test.ts) and [installed-CLI](../src/host/install-cli.test.ts) host fixtures are the e2e layer.

## Must not regress

Settings trust

- **Critical, unit:** Untrusted project settings are excluded before validation, so an invalid untrusted section cannot disable display.
- **High, unit:** An invalid global or trusted project section keeps original tool renderers and disables native observation, even if a later section overrides its values.
- **High, unit:** Renderer overrides match exact tool names, including prototype-like names, before automatic adapter selection.
- **High, e2e:** Under automatic selection, tools without a verified adapter keep a supplied renderer slot, from their definition or a `registerToolRenderer` resolver, and receive generic cards only when neither slot exists. Unregistered tools always receive generic cards, so late registration can upgrade them.

Execution and borrowed data

- **Critical, e2e:** Failures in observation callbacks or fact persistence do not replace a delegated tool result or error.
- **Critical, unit:** Borrowed arguments, results, and messages stay unchanged during rendering, expansion, and row reuse.
- **Critical, e2e:** Observed native calls keep their construction settings, including the shell path and command prefix.
- **High, e2e:** Native observation requires an interactive TUI binding, verified native provenance, and selection of the specialised native adapter.
- **High, e2e:** Display integration preserves tool parameter schemas and results produced through Pi's middleware, registers no tools, and leaves the active tool selection unchanged.
- **High, integration:** File mutation observation uses the shared capture rather than rereading targets for display.

Saved history

- **Critical, unit:** New `pi-tool-display.facts` entries contain bounded operation, cancellation, patch, and saved-output reference facts, not result bodies, images, styled text, or live shell previews. Records above the whole-record byte limit are rejected, including when unknown fields cause the excess.
- **High, e2e:** Display facts use custom session entries, not model-context messages.
- **Critical, e2e:** Replay restores matching recorded facts without rerunning tools or observing source mutations again. Eligible expanded cards may still read saved output.

Reload and disposal

- **High, e2e:** Reload and removal restore only hooks and definitions still owned by this extension, and keep wrappers installed later.
- **High, integration:** Disposing display observation leaves other mutation subscribers active, and retained observation callbacks cannot update calls or persist facts after their display session is disposed.
- **High, e2e:** Pending host-event continuations cannot reattach assistant decoration after disposal or take row ownership from a replacement transcript binding.

## Not tested

- Call interpretation, adapter recognition and fallback, exploration groups and runs, cards, labels, pending markers, diffs and previews, saved-output read budgets, and nested-instruction notice cards: below the severity bar. Use the manual checks.
- Shared algorithms and budgets: owned by libs and utils.
- Paid or live MCP and FFF search requests, upstream tool execution matrices, and native persistence internals.

## Manual checks

Terminal image protocols, drag selection, visual themes, platform-specific shell behaviour, and the full visual scenario matrix: use the [validation checks](validation.md). Headless render assertions do not establish them.
