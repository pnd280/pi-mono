# Pi compatibility for maintainers

[@pi-mono/utils](../README.md)

> Last verified against Pi 1.2.0 (package checks and all helper tests; tool source provenance unchanged; no runtime changes needed). Not covered: live FFF behaviour.

## Upgrade procedure

1. Run the [package checks](../README.md#validation).
2. Run the checks of the libs modules and extensions whose input or output assumptions changed. This package needs no standalone terminal scenario.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

- [ ] Trace the [direct and indirect consumers](../AGENTS.md#code-navigation). FFF provenance and scope normalisation, omission ranges, patches, and UTF-8 boundaries must still match the target tool and result contracts.
- [ ] Keep helpers pure; do not introduce Pi runtime state, I/O, scheduling, or consumer policy.

## Limitations

Compare new public Pi helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing and failure behaviour, and consumers all agree; a similar name doesn't mean the behaviour is the same.
