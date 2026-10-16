# Pi compatibility for maintainers

[@pi-mono/utils](../README.md)

> Last verified against Pi 1.3.0 (package checks and all helper tests; source diffs against 1.2.0: extension types and tool source provenance unchanged, and the built-in tool changes are limited to read rendering; no runtime changes needed). Not covered: live FFF behaviour.

## Upgrade procedure

1. Run the [package checks](../README.md#validation).
2. Run the checks of the libs modules and extensions whose input or output assumptions changed. This package needs no standalone terminal scenario.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

- [ ] Trace the [direct and indirect consumers](../AGENTS.md#code-navigation). FFF provenance and scope normalisation, omission ranges, patches, and UTF-8 boundaries must still match the target tool and result contracts.
- [ ] Keep helpers pure; do not introduce Pi runtime state, I/O, scheduling, or consumer policy.

## Limitations

Compare new public Pi helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing and failure behaviour, and consumers all agree; a similar name doesn't mean the behaviour is the same.

Pi 1.3.0 adds `formatReadLineRange`, a read-header range formatter with no counterpart here, and resolves model references with registry-aware matching that is not exported from the package root. Neither replaces [`model-reference`](../src/model-reference.ts), which only checks and splits the `provider/model-id` syntax.
