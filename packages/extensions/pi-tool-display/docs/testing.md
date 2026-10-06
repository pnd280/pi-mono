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
- **Critical, e2e (T1):** Collection in TUI, RPC, print, and JSON preserves execution, trusted settings, verified native selection, renderer overrides, and middleware. Native observation requires verified native provenance and selection of the specialised native adapter.
- **High, e2e:** Display integration preserves tool parameter schemas and results produced through Pi's middleware, registers no tools, and leaves the active tool selection unchanged.
- **High, integration:** File mutation observation uses the shared capture rather than rereading targets for display.

Saved history

- **Critical, unit:** New `pi-tool-display.facts` entries contain bounded operation, cancellation, patch, and saved-output reference facts, not result bodies, images, styled text, or live shell previews. Records above the whole-record byte limit are rejected, including when unknown fields cause the excess.
- **High, e2e:** Display facts use custom session entries, not model-context messages.
- **Critical, e2e:** Replay restores matching recorded facts without rerunning tools or observing source mutations again. Eligible expanded cards may still read saved output.
- **Critical, e2e and unit (T2):** Portable metadata stays bounded and outside model context. Specialised foreign interpretation requires matching source calls and supported recorded contracts; live activity also matches its task session and collector generation. Pure byte-limit edge cases extend existing record validation.
- **Critical, e2e (T3):** Foreign viewing preserves the source session and borrowed data, never executes tools or imports child extensions, and never rereads mutation targets. Only the supplied saved-output loader may read referenced output. A snapshot marked historical never invokes that loader; unavailable external output does not replace retained content.
- **High, e2e (T4):** Snapshot/live reconciliation exposes each committed call and result once on the selected branch across overlap, refresh, reconnect, compaction, and branch changes. Incomplete historical outcomes remain unavailable. Historical replacement clears provisional messages, running state, and execution updates even when entry IDs match.

Reload and disposal

- **High, e2e:** Reload and removal restore only hooks and definitions still owned by this extension, and keep wrappers installed later.
- **High, integration:** Disposing display observation leaves other mutation subscribers active, and retained observation callbacks cannot update calls or persist facts after their display session is disposed.
- **High, e2e:** Pending host-event continuations cannot reattach assistant decoration after disposal or take row ownership from a replacement transcript binding.
- **High, e2e (T5):** Disposed collectors and viewers cannot update or persist into replacement sessions; disposal preserves other mutation subscribers and later wrappers.

## Not tested

- Call interpretation, adapter recognition and fallback, exploration groups and runs, cards, labels, pending markers, diffs and previews, saved-output read budgets, and nested-instruction notice cards: below the severity bar. Use the manual checks.
- Shared algorithms and budgets: owned by libs and utils.
- Paid or live MCP and FFF search requests, upstream tool execution matrices, and native persistence internals.

## Manual checks

Terminal image protocols, drag selection, visual themes, platform-specific shell behaviour, and the full visual scenario matrix: use the [validation checks](validation.md). Headless render assertions do not establish them.
