# Pi compatibility

[pi-tool-display](../README.md)

## Contracts to verify

- [ ] [Host hooks](../src/host/compatibility.ts): construction, row insertion, expansion, thinking, reload, and conditional restoration; inspect API and installed CLI before changing fingerprints.
- [ ] [Native observation](../../../libs/src/native-tools/README.md): preserve middleware, definitions, active tools, mutation ordering, and other subscribers.
- [ ] [Transcript](../src/transcript/session.ts): visible notices and boundary custom messages split groups; invisible metadata, hidden messages, and context edits do not. Preserve row ownership across replay slices around boundary compaction summaries. Replay retained facts without execution or file reobservation.
- [ ] [Adapters](adapters.md): verify provenance, schemas, borrowed results, cancellation, saved-output references, and image ownership, including FFF/MCP consumers.

## Limitations and replacement opportunities

- Public host/observation APIs could replace private hooks if they preserve the contracts above; trace shared-library consumers before removal.
- [Pi 0.87.0 image-row limitation](validation.md#platform-limitations): revisit finalized-message image updates against the target; compare live and replay with and without this extension.

## Validation

Use [package checks](../README.md#validation), [API](../src/host/install.test.ts) and [CLI](../src/host/install-cli.test.ts) suites, and [terminal/adapter checks](validation.md). Include regular/fullscreen, reload, and replay.
