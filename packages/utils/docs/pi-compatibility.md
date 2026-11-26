# Pi compatibility for maintainers

[@pi-mono/utils](../README.md)

> Last verified against Pi 1.6.1 with package checks, all helper tests, and a source review of the Pi 1.6.0 to 1.6.1 changes. Not covered: the randomised probe that parses native `edit` patches with `parsePatch`, which last ran on Pi 1.5.1.

## Checklist

- [ ] Pi tool results still carry text that the [output-text](../src/output-text.ts) consumers transform with omission ranges as UTF-16 offsets.
- [ ] Pi's native `edit` results still supply one unified patch that [`parsePatch`](../src/patch.ts) accepts.
- [ ] Pi's byte-limited tool output still clips a head or tail edge that [`decodeUtf8Window`](../src/utf8.ts) identifies correctly.
- [ ] Pi still runs input handlers before its native skill insertion, which starts only at a leading `/skill:<name>` followed by a literal space or the end, and before prompt-template expansion, which ends the name at any whitespace, as the [skill-reference guard](../src/skill-reference.ts) assumes.
- [ ] [Thinking levels](../src/thinking-levels.ts) match `MODEL_THINKING_LEVELS` in Pi's `@earendil-works/pi-ai/providers/model-schema`, in the same order.

## Limitations

Compare new public Pi helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing and failure behaviour, and consumers all agree.

The current host offers these related helpers, and none replaces a module here:

| Pi helper                                                                                          | Why this package keeps its own code                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_THINKING_LEVELS` in `@earendil-works/pi-ai/providers/model-schema`                          | In Pi 1.6.1, the extension loader maps no alias for that entry point, so installed extensions can't import it. [Thinking levels](../src/thinking-levels.ts) keep a copy.                       |
| `resolveCliModel` from the `@earendil-works/pi-coding-agent` root                                  | It resolves CLI provider and model options against the model registry. [`model-reference`](../src/model-reference.ts) only checks and splits the `provider/model-id` syntax, with no registry. |
| `formatReadLineRange` from the `@earendil-works/pi-coding-agent` root                              | It formats read-header line ranges, which no module here does.                                                                                                                                 |
| `truncateHead`, `truncateTail`, and `truncateLine` from the `@earendil-works/pi-coding-agent` root | They truncate decoded strings. [`decodeUtf8Window`](../src/utf8.ts) decodes a raw byte window and counts the bytes that it drops at a clipped edge.                                            |

Since Pi 1.5.1, the native `edit` tool builds its patch from the edited regions instead of a whole-file diff. The patch format is unchanged, and the randomised probe on Pi 1.5.1 found that `parsePatch` accepts it.
