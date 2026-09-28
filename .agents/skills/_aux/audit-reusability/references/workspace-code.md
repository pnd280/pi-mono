# Workspace code reuse

[Return to the reusability audit](../SKILL.md).

Use these checks for shared-package reuse or extraction across workspace consumers. Follow [workspace ownership and reuse rules](../../../../../docs/agents/architecture.md) when choosing the destination.

## Shared contract

- Search shared packages for the parsing, validation, formatting, path handling, resource management, or UI behavior before proposing extraction.
- Compare repeated constructors, fixtures, adapters, and lifecycle handlers by contract, not syntax. Name the actual consumers that need the shared behavior.
- Separate common behavior from consumer-owned policy, data, formatting, and effects.
- Assess maintenance savings against coupling and adaptation cost. Hypothetical future consumers, fewer lines, or a flag-heavy abstraction do not establish value.
- Inspect wrappers for validation, normalization, policy, type restrictions, resource ownership, or a supported boundary before classifying them as redundant.

For reuse, record exact modules/exports and contract fit. For extraction, record sources, actual consumers, destination, and the minimal useful contract. Cross-package consumers use declared entry points.

## Consumer preservation

Inspect every consumer and all usages of code proposed for removal:

- Compare required inputs/outputs, types, empty values, trimming, sanitization, order, truncation, IDs, mutation, and fresh versus shared nested objects.
- Check lifecycle, errors, cancellation, disposal, restoration, output bounds, and yielding.
- For UI contracts, compare layout, selection/scroll ownership, asynchronous preparation, coordinates, and invalidation.
- Trace ownership and effects through adapters so extraction preserves consumer policy and dependency direction.

Keep distinct policy local, and retain duplication when sharing costs more than it saves. Partial substitution can leave the enclosing helper or module necessary; name the responsibility that remains.
