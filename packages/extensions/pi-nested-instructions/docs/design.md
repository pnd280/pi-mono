# Discovery design and sources

[Package](../README.md) · [Glossary](../GLOSSARY.md)

Maintainers use this reference for input adapters, nested skills, and session persistence. The [loading rules](loading.md) and the [nested skill rules](skills.md) define user-facing behaviour, and the [input discovery guide](input-discovery.md) lists the inputs that give scope.

## Source behaviour

Based on OpenCode v2 at [`39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49`](https://github.com/anomalyco/opencode/tree/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49):

- [Read-tool discovery](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/tool/plugin/read.ts) walks nested ancestors to the workspace boundary.
- [Session instructions](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/session/instructions.ts) records synthetic instruction messages and deduplicates against surviving context.
- [v2 instructions documentation](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/services/www/src/docs/content/instructions.mdx) distinguishes ambient instructions from nested [snapshots](../GLOSSARY.md#delivery).

Pi 1.6.0 is the host reference. [Pi's loading rules](loading.md#which-files-load) take precedence over OpenCode's. OpenCode's ambient watcher and startup search are not ported. [Nested skills](#nested-skills) have no OpenCode source.

## Input adapters

The [input discovery guide](input-discovery.md) owns the recognised tools and the Bash syntax that stops inference.

[Bash inference](../src/bash.ts) reads the [unbash](https://github.com/webpro-nl/unbash) AST, and [scope extraction](../src/scopes.ts) maps tool inputs to scopes.

## Pi adaptation

Discovery reads the inputs that [input discovery](input-discovery.md) describes. It handles each batch at `turn_end`:

1. Take direct tool inputs from the completed assistant message supplied at `turn_end`.
2. Add nested inputs collected from public `tool_execution_start` events carrying `parentToolCallId`, including blocked or invalid attempts.
3. Infer the batch's scopes and save all [read markers](../GLOSSARY.md#discovery).
4. Discover the remaining instructions, and list the skills of each directory in scope after its notice.

Discovery deduplicates against `turn_end.context.contextEntries`, which includes earlier handlers' drafted notices, compaction, and context edits. It appends its drafts to `turn_end.entries`, preserving the earlier drafts. Startup and reload refresh use the committed session projection.

Discovery clears pending inputs at turn and session boundaries. Handling the whole batch at once avoids races between sibling calls, and needs no tool replacement, steering, or retry.

The [nested-call rule](loading.md#which-files-load) applies across the batch: a sibling [direct read](../GLOSSARY.md#discovery) can still suppress the matching file. Unknown nested tool schemas and opaque parent code provide no scope unless a supported child input is observed.

A direct-read marker holds a lexical path, a filesystem revision, and the IDs of the entry and call that created it. It holds no instruction text.

Discovery creates a marker only when the boundary projection still contains the exact `turn_end.messageEntryId` and tool-call ID, with the issued tool name and arguments. The marker also stores a call fingerprint. If a later context edit replaces the call, the fingerprint no longer matches, and the marker stops suppressing rediscovery.

A [notice](../GLOSSARY.md#delivery) holds the full selected instructions, structured metadata, and a `messageDigest` of the whole model-facing message, including the note and tag around the instructions. If a context edit keeps the source details but changes the delivered text, the digest no longer matches.

Markers are per file, so they suppress only the file that the call read. Failed and blocked direct read attempts also create markers. The loading rules state the [user-visible effect](loading.md#which-files-load).

## Nested skills

Pi has no public API that registers a skill during a session, and the extension never changes the system prompt, because not every provider accepts a system prompt that changes during a conversation. So [nested skills](../GLOSSARY.md#discovery) register once and are announced later:

1. The `session_start` handler runs the [skill folder search](../src/skill-folders.ts) when `ctx.isProjectTrusted()` is true. Pi awaits the handler, so the search is complete before the first prompt.
2. The `resources_discover` handler returns every found folder as a skill path, and records the skills that Pi loaded on its own. Pi loads the folders with its own loader, after its own skills, so `pi.getCommands()` lists each nested skill with its file path. Pi's commands, pi-skills, and pi-t3-skills read that list and need no change.
3. On every run, the `before_agent_start` handler removes the skills of the found folders from the shared `systemPromptOptions.skills`, except the skills recorded at `resources_discover`. An earlier handler that returns `systemPrompt` defeats this filter, as the [limitations](pi-compatibility.md#limitations) say.
4. At `turn_end`, discovery adds a [skill listing](../GLOSSARY.md#delivery) for each directory that the batch reached, that has a found skill folder and at least one skill to list, and whose skill list is not still in context. The listing follows the directory's notice from the same batch.

The [listing module](../src/skill-listings.ts) reads the folders with Pi's `loadSkillsFromDir` and renders the list with Pi's `formatSkillsForPrompt`, so parsing, validation, and the list format stay Pi's. It asks for the `indirect` variant of the list, which names no tool for reading the skill file.

The search alone posts nothing; tool inputs select the directories. Outside a run, `ctx.getSystemPrompt()` and Pi's base prompt still include nested skills, as the [limitations](pi-compatibility.md#limitations) record.

The search matches ignore rules with the `ignore` package, case-insensitively, along the chain of physical directories from the repository root, which it finds from the real path of cwd. As in git, the last matching rule decides, a nearer ignore file's rules come later, and a directory inside an excluded directory cannot be re-included. It tests the directory that holds a skill folder, not the `.agents` or `.pi` path itself, because Pi doesn't test its own skill folders against the ignore files outside them.

## Session lifetime

Discovery and refresh query the [ledger](../GLOSSARY.md#delivery); notices and listings encode and decode their own details. The ledger reads branch entries for metadata, and accepts a notice or listing only when the session projection still holds its message.

The ledger accepts a notice only when its complete projected message matches `messageDigest`. It privately retains the selected path and the body decoded from that visible message, using the persisted display spelling rather than the current cwd. Refresh compares the newly selected path and instruction body directly with that snapshot, including empty content and exact whitespace. Notice metadata contains neither a filesystem revision nor a separate body fingerprint.

The loading rules state the [rediscovery and refresh rules](loading.md#compaction-branching-and-reload) that users see. Metadata-only markers do not add instruction content. Refresh uses only scopes that canonical context still represents, and unchanged direct-read revisions suppress content reads.

Refresh sends its notices and listings in a [lifecycle startup commit](../../../libs/src/lifecycle/phases.md#startup-barrier) at rank `100`, which runs after every extension's `session_start` handler. Pi appends them at once because the session is idle, so they precede the startup entries of pi-profiles (rank `200`) in every load order.

The ledger accepts a listing under the same digest rule, and keeps the skill list of each directory's latest visible listing, empty after a removal. Refresh renders the directory's current skills and compares the result with that list; the [nested skill rules](skills.md#compaction-branching-and-reload) state the resulting actions. The found skill folders live in memory only, and each `session_start` replaces them.

The [persisted contracts](pi-compatibility.md#persisted-contracts) define which notice and listing formats the ledger accepts.
