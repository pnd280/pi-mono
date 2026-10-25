# Nested instruction test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Glossary](../GLOSSARY.md)

This package tests nested-input delivery, [read-marker](../GLOSSARY.md#discovery) lifetime, and full-body notices against canonical session context; libs and utils own shared algorithms, and the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md) owns rendering.

## Must not regress

E2e checks drive a Pi host with its faux provider and network access disabled. They also exercise sibling batching and reload diffing within the invariants below. Integration checks use real instruction files and the installed `SessionManager` without a host.

- **Critical, integration:** Inferred scopes stay strictly inside the lexical cwd and never include symlink-target ancestor scopes.
- **Critical, integration:** Selecting a file symlink keeps its lexical scope.
- **High, e2e:** Nested discovery leaves Pi's native global, cwd, and parent instruction loading and reload behaviour unchanged.
- **High, e2e:** Supported nested tool inputs can load instructions even when the parent hides the child output, unless a sibling [direct read](../GLOSSARY.md#discovery) suppresses the selected file.
- **High, e2e:** Nested calls do not create direct-read suppression markers, including blocked and invalid child attempts.
- **High, integration:** A notice stops suppressing rediscovery when its complete message is changed or omitted from the canonical session projection by context edits, compaction, or branch navigation.
- **High, integration:** A direct-read marker suppresses rediscovery only while its exact originating entry and unchanged tool call stay in the canonical session projection.
- **High, e2e:** Loaded and updated notices carry the full selected instruction body and schema-valid metadata. pi-tool-display leaves them unchanged under its [borrowed-data invariant](../../pi-tool-display/docs/testing.md#execution).

## Not tested

- Host-driven context edits, compaction, and branch navigation are not tested in a host. The canonical-context lifetime scenarios use `SessionManager` integration checks. Separate [offline host tests](../src/index.test.ts) cover reading `turn_end.context.contextEntries`, preserving earlier notice drafts, and creating direct-read markers with the host entry ID. The [compatibility checklist](pi-compatibility.md#session) covers the remaining wiring.
- File selection order and Bash and FFF input inference cases outside the invariants above are below the severity bar. Inference rejects unsupported syntax by design, as the [Bash inference rules](input-discovery.md#bash-inference) state.
- Pi's default notice renderer when discovery loads alone is below the severity bar.
- FFF owns whether its searches and indexes are correct.
- Arbitrary shell evaluation is not tested because discovery never runs commands.
- Real provider calls are not tested because the e2e checks run offline with the faux provider.
- Byte equality of direct reads is not tested because discovery is input-only, and wildcards never prove which instruction file a tool read.
- Temporary message filtering by other extensions and final provider-payload rewrites are not tested because they are outside the canonical session projection.
