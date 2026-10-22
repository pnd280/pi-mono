# Discovery design and sources

[Package](../README.md) · [Glossary](../GLOSSARY.md)

Maintainers use this reference for input adapters and session persistence. The [README](../README.md#usage) defines user-facing loading rules, and the [input discovery guide](input-discovery.md) lists the inputs that give scope.

## Source behaviour

Based on OpenCode v2 at [`39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49`](https://github.com/anomalyco/opencode/tree/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49):

- [Read-tool discovery](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/tool/plugin/read.ts) walks nested ancestors to the workspace boundary.
- [Session instructions](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/session/instructions.ts) records synthetic instruction messages and deduplicates against surviving context.
- [v2 instructions documentation](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/services/www/src/docs/content/instructions.mdx) distinguishes ambient instructions from nested [snapshots](../GLOSSARY.md#delivery).

Pi 1.4.0 is the host reference. [Pi's loading rules](../README.md#usage) take precedence over OpenCode's. OpenCode's ambient watcher and startup search are not ported.

FFF adapters reference [pi-fff source](https://github.com/dmtrKovalenko/fff/tree/89c19270ea2dfc20829a7429f72022571558093e/packages/pi-fff/src) at `89c19270ea2dfc20829a7429f72022571558093e`. Source schemas, rather than abbreviated README parameters, define the inputs.

## Input adapters

The [input discovery guide](input-discovery.md) owns the recognised tools and the Bash syntax that stops inference.

[Bash inference](../src/bash.ts) reads the [unbash](https://github.com/webpro-nl/unbash) AST, and [scope extraction](../src/scopes.ts) maps tool inputs to scopes.

## Pi adaptation

Discovery reads the inputs that [input discovery](input-discovery.md) describes. It handles each batch at `turn_end`:

1. Take direct tool inputs from the completed assistant message supplied at `turn_end`.
2. Add nested inputs collected from public `tool_execution_start` events carrying `parentToolCallId`, including blocked or invalid attempts.
3. Infer the batch's scopes and save all [read markers](../GLOSSARY.md#discovery).
4. Discover the remaining instructions.

Discovery deduplicates against `turn_end.context.contextEntries`, which includes earlier handlers' drafted notices, compaction, and context edits. It appends its drafts to `turn_end.entries`, preserving the earlier drafts. Startup and reload refresh use the committed session projection.

Discovery clears pending inputs at turn and session boundaries. Handling the whole batch at once avoids races between sibling calls, and needs no tool replacement, steering, or retry.

The [nested-call rule](../README.md#which-files-load) applies across the batch: a sibling [direct read](../GLOSSARY.md#discovery) can still suppress the matching file. Unknown nested tool schemas and opaque parent code provide no scope unless a supported child input is observed.

A direct-read marker holds a lexical path, a filesystem revision, and the IDs of the entry and call that created it. It holds no instruction text.

Discovery creates a marker only when the boundary projection still contains the exact `turn_end.messageEntryId` and tool-call ID, with the issued tool name and arguments. The marker also stores a call fingerprint. If a later context edit replaces the call, the fingerprint no longer matches, and the marker stops suppressing rediscovery.

A [notice](../GLOSSARY.md#delivery) holds the full selected instructions, structured metadata, and a `messageDigest` of the whole model-facing message, including the note and tag around the instructions. If a context edit keeps the source details but changes the delivered text, the digest no longer matches.

Markers are per file, so they suppress only the file that the call read. Failed and blocked direct read attempts also create markers. The README states the [user-visible effect](../README.md#which-files-load).

## Session lifetime

Discovery and refresh query the [ledger](../GLOSSARY.md#delivery), never raw session entries; notices encode and decode their own details.

The ledger accepts a notice only when its complete projected message matches `messageDigest`. It privately retains the selected path and the body decoded from that visible message, using the persisted display spelling rather than the current cwd. Refresh compares the newly selected path and instruction body directly with that snapshot, including empty content and exact whitespace. Notice metadata contains neither a filesystem revision nor a separate body fingerprint.

The README states the [rediscovery and refresh rules](../README.md#compaction-branching-and-reload) that users see. Metadata-only markers do not add instruction content. Refresh uses only scopes that canonical context still represents, and unchanged direct-read revisions suppress content reads.

Refresh sends its notices in a [lifecycle](../../../libs/src/lifecycle/README.md) startup commit at rank `100`. Commits run in the first participant's `resources_discover` handler, which Pi emits after every extension's `session_start` handler has run. Pi appends them at once because the session is idle, so they precede the startup entries of pi-profiles (rank `200`) in every load order.

The [version-3 persisted contract](pi-compatibility.md#persisted-notice-contract) defines which notice formats contribute scopes.

## Shared scope extraction

[Shared scope helpers](../../../utils/docs/caller-boundaries.md#search-scopes) own brace expansion, fixed glob prefixes, filename filters, and FFF expression parsing. Discovery supplies existing-query-path facts and retains lexical hints after access failures. It ignores negative terms and keeps its own direct-read policy; it does not adopt `pi-fff-guard`'s blocking, missing-path, intersection, exclusion, or Git policies.
