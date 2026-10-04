# Pi compatibility for maintainers

[@pi-mono/utils](../README.md)

> Last verified against Pi 1.0.2 (package checks and all helper tests in the workspace run, with all consumer suites; no runtime changes needed). Not covered: live FFF behaviour.

## Upgrade procedure

1. Run the [package checks](../README.md#validation).
2. Run the affected libs and extensions whose input or output assumptions changed. This package needs no standalone terminal scenario.
3. Work through the checklist below, then update the "Last verified" line.

Cooperative search owns the [fuzzy-score differential checks](../../libs/src/text-search/README.md#validation) against Pi. They are no longer utility-package checks.

## Checklist

- [ ] Trace the [direct and indirect consumers](../AGENTS.md#code-navigation). FFF provenance and scope normalisation, source coordinates, omission ranges, patches, and UTF-8 boundaries must still match the target tool and result contracts.
- [ ] Keep helpers pure; do not introduce Pi runtime state, I/O, scheduling, or consumer policy.

## Limitations

Compare new public Pi helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing and failure behaviour, and consumers all agree; a similar name doesn't mean the behaviour is the same.
