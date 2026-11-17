# Workspace code reuse

[Return to the reusability audit](../SKILL.md).

Follow [workspace ownership and reuse rules](../../../../../docs/agents/architecture.md) when choosing the destination.

## Shared contract

- Compare repeated constructors, fixtures, adapters, and lifecycle handlers by contract, not syntax. Name the actual consumers that need the shared behaviour.
- Assess maintenance savings against coupling and adaptation cost. Hypothetical future consumers, fewer lines, or a flag-heavy abstraction do not establish value.
- Inspect wrappers for validation, normalisation, policy, type restrictions, resource ownership, or a supported boundary before classifying them as redundant.

## Consumer preservation

Inspect every consumer and all usages of code proposed for removal:

- Compare required inputs and outputs, types, empty values, trimming, sanitisation, order, truncation, IDs, mutation, and fresh versus shared nested objects.
- Check lifecycle, errors, cancellation, disposal, restoration, output bounds, and yielding.
- For UI contracts, compare layout, selection/scroll ownership, asynchronous preparation, coordinates, and invalidation.
- Trace ownership and effects through adapters so extraction preserves consumer policy and dependency direction.

Partial substitution can leave the enclosing helper or module necessary; name the responsibility that remains.
