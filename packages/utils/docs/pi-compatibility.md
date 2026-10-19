# Pi compatibility for maintainers

[@pi-mono/utils](../README.md)

> Last verified against Pi 1.3.0 with package checks, all helper tests, and a source diff against 1.2.0. Not covered: live FFF behaviour.

## Upgrade procedure

1. Run the [focused checks](../../../docs/development.md#focused-validation) for `@pi-mono/utils`.
2. Run the checks of the libs modules and extensions whose input or output assumptions changed. This package needs no standalone terminal scenario.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

- [ ] FFF provenance and scope normalisation, omission ranges, patches, and UTF-8 boundaries match the Pi tool and result contracts that their [direct and indirect consumers](../AGENTS.md#code-navigation) target.
- [ ] [Thinking levels](../src/thinking-levels.ts) match `MODEL_THINKING_LEVELS` in Pi's `@earendil-works/pi-ai/providers/model-schema`, in the same order.

This package keeps its own copy of the thinking levels, because installed extensions can't import that entry point.

## Limitations

Compare new public Pi helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing and failure behaviour, and consumers all agree; a similar name doesn't mean the behaviour is the same.

In Pi 1.3.0, a source diff against 1.2.0 found extension types and tool source provenance unchanged, and built-in tool changes limited to read rendering. This package needed no runtime changes.

Pi 1.3.0 adds `formatReadLineRange`, a read-header range formatter with no counterpart here, and resolves model references with registry-aware matching that is not exported from the package root. Neither replaces [`model-reference`](../src/model-reference.ts), which only checks and splits the `provider/model-id` syntax.
