# Nested instruction test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Glossary](../GLOSSARY.md)

This package tests nested-input delivery, [read-marker](../GLOSSARY.md#discovery) lifetime, and full-body [notices](../GLOSSARY.md#delivery) against canonical session context.

Libs and utils own shared algorithms; the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md) owns rendering. E2e checks drive a Pi host with its faux provider and network access disabled. Integration checks use real instruction files and the installed `SessionManager` without a host.

## Must not regress

- **Critical, integration:** Inferred scopes stay strictly inside the lexical cwd and never include symlink-target ancestor scopes. Selecting a file symlink keeps its lexical scope.
- **High, e2e:** Nested discovery leaves Pi's native global, cwd, and parent instruction loading and reload behaviour unchanged.
- **High, e2e:** Supported nested tool inputs can load instructions even when the parent hides the child output, unless a sibling [direct read](../GLOSSARY.md#discovery) suppresses the selected file.
- **High, e2e:** Nested calls do not create direct-read suppression markers, including blocked and invalid child attempts.
- **High, e2e:** A notice stops suppressing rediscovery when its complete message is changed or omitted from the canonical session projection by context edits, compaction, or branch navigation.
- **High, e2e:** A direct-read marker suppresses rediscovery only while its exact originating entry and unchanged tool call stay in the canonical session projection.
- **High, e2e:** Loaded and updated notices carry the full selected instruction body and schema-valid metadata, whether or not pi-tool-display is loaded.

## Not tested

- Host-driven context edits, compaction, and branch navigation: the canonical-context lifetime scenarios currently use `SessionManager` integration checks.
- File selection order, Bash and FFF input inference rules, batching, and reload diffing: below the severity bar. Inference rejects unsupported syntax by design; see [Bash inference](design.md#bash-inference).
- Pi's default notice renderer when discovery loads alone: below the severity bar.
- Whether FFF searches and indexes correctly, arbitrary shell evaluation, and real provider calls.
- Byte equality of direct reads: discovery is input-only, and wildcards never prove which instruction file a tool read.
- Temporary message filtering by other extensions and final provider-payload rewrites: outside the canonical session projection.
