# Tool-display test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Glossary](../GLOSSARY.md)

This package tests settings trust, delegated execution through its private Pi host access, [saved call facts and local details](../GLOSSARY.md#interpretation), and hook ownership across reload and disposal; libs and utils own shared budgets and algorithms, and producers own their result contracts, such as [`pi-read/result`](../../pi-read/docs/result.md).

## Must not regress

### Settings and selection

- **Critical, unit:** Untrusted project settings are excluded before validation, so an invalid untrusted section cannot disable display.
- **High, unit:** An invalid global or trusted project section keeps original tool renderers and disables [native observation](../GLOSSARY.md#interpretation), even if a later section overrides its values.
- **High, unit:** Renderer overrides match exact tool names, including prototype-like names, before automatic adapter selection.
- **High, e2e:** Under automatic selection, tools without a verified adapter keep a supplied renderer slot, from their definition or a `registerToolRenderer` resolver, and receive generic cards only when neither slot exists.
- **High, e2e:** Under automatic selection, unregistered tools always receive generic cards, so late registration can upgrade them.

### Execution

- **Critical, e2e:** Failures in observation callbacks, session entry writes, or local-store writes do not replace a delegated tool result or error.
- **Critical, unit:** Borrowed arguments, results, and messages stay unchanged during argument validation, rendering, expansion, and row reuse.
- **Critical, e2e:** Observed native calls keep their construction settings, including the shell path and command prefix.
- **Critical, e2e:** Collection in TUI, RPC, print, and JSON preserves execution, trusted settings, verified native selection, renderer overrides, and middleware.
- **Critical, e2e:** Native observation runs only for calls with verified native provenance and the specialised native adapter selected.
- **High, e2e:** Display integration preserves tool parameter schemas and results produced through Pi's middleware.
- **High, e2e:** Display integration registers no tools and leaves the active tool selection unchanged.
- **High, e2e:** Startup and the session remain usable when private host hooks are incompatible or non-writable.
- **High, e2e:** Failed hook installation leaves no partial hooks.
- **High, e2e:** Buffered and replayed tool rows retain the correct call's arguments and results.
- **High, integration:** File mutation observation uses the shared capture rather than rereading targets for display.

### Saved facts

- **Critical, unit:** `pi-tool-display.call` entries contain only the listed outcome, exit, timeout, application, and change facts and bounded patches.
- **Critical, unit:** Local lines contain no result bodies, images, styled text, or previews.
- **Critical, unit:** Call and writer records above the whole-record byte limit are rejected, including when unknown fields cause the excess.
- **Critical, integration:** Local-store folders and files are owner-only.
- **Critical, integration:** A planted symlink is refused for writing, and symlinked or hard-linked files are refused for reading.
- **High, unit:** An `edit` change fact is saved only when the result cannot replace it: a non-successful or missing result, or a missing, invalid or different `details.patch`. Line endings, file headers, and a BOM do not count as differences.
- **High, unit:** A `write` creation entry without a patch replays the same diff as the observed patch. When they differ, the entry keeps the observed patch.
- **High, e2e:** Call facts use custom session entries, not model-context messages.

### Replay

- **Critical, e2e:** Replay restores matching saved facts without rerunning tools or observing source mutations again. Eligible expanded cards may still read saved output.
- **High, e2e:** After a fork and reload, replay shows session facts and local durations for the same calls.
- **High, e2e:** After a fork and reload with the local-store folder removed, replay shows session facts and the "not on this machine" notice.

### Hooks and disposal

- **High, e2e:** Reload and removal restore only hooks and definitions still owned by this extension, and keep wrappers installed later.
- **High, integration:** Retained observation callbacks cannot update calls or persist facts after their display session is disposed.
- **High, e2e:** Disposal leaves other mutation subscribers and later wrappers active.
- **High, e2e:** Disposed collectors cannot update or persist into replacement sessions.
- **High, e2e:** Pending host-event continuations cannot reattach assistant decoration after disposal or take row ownership from a replacement transcript binding.

## Not tested

- [Call interpretation](../GLOSSARY.md#interpretation), adapter recognition and fallback, [exploration groups and runs](../GLOSSARY.md#transcript-structure), cards, labels, pending markers, diffs and previews, saved-output reads (budgets and file-state checks) and preview caching, and nested-instruction notice cards are below the severity bar, and the [manual checks](#manual-checks) cover them.
- Libs and utils own shared algorithms and budgets.
- Live MCP and FFF search requests are not tested because they need paid or live services.
- Pi and the producing extensions own upstream tool execution matrices.
- Pi owns native persistence internals.

## Manual checks

The [API](../src/host/install.test.ts) and [installed-CLI](../src/host/install-cli.test.ts) fixtures test host integration. Headless render assertions do not establish terminal behaviour, so use the [terminal checks](validation.md) for terminal image protocols, drag selection, visual themes, platform-specific shell behaviour, and the full visual scenario matrix.
