# Pi compatibility

[@pi-mono/utils](../README.md)

## Contracts to verify

- [ ] Trace [direct and indirect consumers](../AGENTS.md#code-navigation): FFF provenance and scope normalization, source coordinates, omission ranges, patches, and UTF-8 boundaries must still match target tool and result contracts.
- [ ] Keep helpers pure; do not introduce Pi runtime state, I/O, scheduling, or consumer policy.

## Limitations and replacement opportunities

- Compare target public helpers with the [supported exports](../README.md#usage). Replace local code only when bounds, Unicode units, parsing/failure behavior, and consumers agree; similar names do not establish equivalence.

## Validation

With Pi **0.99.1**, package checks and all pure-helper tests passed, including Pi fuzzy-score comparisons. Shared libs, FFF guard, nested-instruction, selective-read, and display consumer suites also passed without utility changes. This evidence does not establish live FFF behavior; external checks were not run.

Use [package checks](../README.md#validation), then affected libs/extensions for changed input/output assumptions. This package needs no standalone Pi terminal scenario.
