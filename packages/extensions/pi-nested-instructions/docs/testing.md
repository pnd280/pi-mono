# Nested instruction coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md) · [Glossary](../GLOSSARY.md)

Maintainer coverage boundary: shared algorithms are tested in libs and utils (see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership)). This package tests adapter policy, instruction selection, metadata lifetime, delivery order, and refresh.

The suite retains filesystem, canonical session projection, and offline real-host integration checks. It has no standalone unit-test matrix for the detailed input-inference rules.

## Must not regress

- Nested discovery leaves Pi's native global, cwd, and parent instruction loading and reload behaviour unchanged.
- Supported nested tool inputs can load instructions even when the parent hides the child output, unless a direct sibling read suppresses the selected file.
- Nested calls do not create direct-read suppression markers, including blocked and invalid child attempts.
- A [notice](../GLOSSARY.md#delivery) stops suppressing rediscovery when its complete message is changed or omitted from the canonical session projection by context edits, compaction, or branch navigation.
- A direct-read marker suppresses rediscovery only while its exact originating entry and unchanged tool call remain in the canonical session projection.
- Loaded and updated notices carry the full selected instruction body and schema-valid metadata independently of whether pi-tool-display is loaded.
- Loading discovery alone leaves Pi's default notice renderer in use.

## Selection

- Pi's first readable regular instruction file is selected in each directory, with BOM handling and fallback on read errors.
- Files are ordered from broad to narrow. The cwd and its ancestors are excluded.
- The requested lexical scope is kept across symlinks.

## Input inference

Scopes are inferred from inputs only, for native tools, selective-read-compatible tools, FFF standalone tools and overrides, multi-grep, and conservative Bash.

- Content patterns, exclusions, fuzzy words, scripts, output destinations, and result text never create unrelated scopes.
- Directory listings don't mark content as read.

### Bash

Example: `cd pkg && cat src/a.ts || rm -rf x` is inferred as a read of `pkg/src/a.ts`, and inference stops at `||`.

- Command boundaries, cwd-sensitive logical and pipeline ordering, literal quoted or escaped metacharacters, unquoted finite braces, and leading stdin redirects are respected.
- Only stdin redirection marks a read. Options with optional arguments, and empty attached long-option values, never consume path operands.
- `find` path operands stop before filter expressions, including a parenthesised expression.
- Commands with only a redirect still stop inference at `||`.
- Parser errors and [unsupported syntax](design.md#bash-inference) reject the whole invocation, even after inference has stopped at a logical branch or an ambiguous cwd change.
- Lazy word parts in ignored arguments, brace contents, and redirect destinations are still validated.
- Dynamic expressions and unsupported quoting combinations never create literal paths.
- Program-file options contribute their file scope and direct-read eligibility; inline programs do not.

## Batching

- Inputs from public nested `tool_execution_start` events are batched with direct calls at `turn_end`, including blocked and invalid children.
- A direct sibling read can still create a read marker.
- Child results and parent source code are not discovery inputs.
- Pending inputs are cleared across turns and sessions.

## Direct reads

- Exact direct reads of instruction files are recorded as metadata without content, including partial, failed, and blocked attempts. No extra content is read for those paths.
- All direct markers are gathered before batch discovery. Markers for lower-priority files don't suppress preferred files.

## Persistence and reload

- Deduplication uses the real session projection. Markers need their originating call. Malformed saved data is ignored.
- Replacing only a notice's preamble still expires its loaded status, even when the instruction body and saved details are unchanged.
- Version-1 notices and version-2 details carrying removed keys are ignored for scope tracking without deleting their original text. See the [persisted notice contract](pi-compatibility.md#persisted-notice-contract).
- Ordinary accesses keep their snapshots.
- Reload detects changed selections, changed content, and removals, without repeating unchanged notices or eagerly restoring compacted scopes.
- Reload compares exact visible bodies, including empty content and whitespace, using the original display spelling across cwd changes. A changed path still causes an update when its body is identical.
- Unchanged direct-read revisions need no content read.

## Real host

- The offline host runs sibling calls without steering.
- Discoveries are saved after results and before the next provider request.
- Reload in a real host keeps deduplication and publishes changed content.

## How to test

- Use disposable filesystem fixtures and the installed `SessionManager` for projection behaviour.
- Host checks use Pi's faux provider with network access disabled.
- Rendering, expansion, layout, and mouse routing are tested in the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## Not covered here

- Whether FFF searches and indexes correctly, arbitrary shell evaluation, and real provider calls.
- Wildcards never prove which instruction file a tool read.
- Metadata revisions don't establish byte equality for direct reads; discovery is input-only by design.
- Temporary message filtering by other extensions, and final rewrites of the provider payload, are outside the canonical session projection and aren't tracked.
