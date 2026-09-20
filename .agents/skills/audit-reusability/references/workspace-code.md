# Workspace code reuse

[Reusability audit](../SKILL.md)

Compare shared packages and consumers. Reuse fitting contracts; extract duplicates only for actual consumers needing stable common behavior.

## Checks

- Do shared packages already provide the parsing, validation, formatting, path handling, resource management, or UI behavior?
- Do repeated constructors, fixtures, adapters, or lifecycle handlers implement the same contract, or merely have similar syntax?
- Can consumers share behavior while keeping their own policy, data, formatting, and effects local?
- Would extraction reduce maintenance without flag-heavy abstractions or coupling unrelated consumers? Fewer lines or hypothetical future reuse is not sufficient evidence.
- Does a wrapper enforce useful validation, normalization, policy, type restrictions, resource ownership, or a supported boundary? A short forwarding body alone does not establish redundancy.
- Does the proposed owner match the shared contract? Keep pure helpers separate from stateful or I/O code, reusable UI separate from host mounting, and consumer-specific policy local. Shared packages must not depend on individual extensions. Cross-package consumers must use declared entry points.

## Evidence

Inspect candidates, shared alternatives, and every consumer. Record required inputs/outputs, empty values, trimming, sanitization, order, truncation, IDs, mutation, and fresh/shared nested objects. Check relevant lifecycle, error, cancellation, disposal, restoration, output bounds, and yielding.

For reuse, identify exact modules/exports and contract fit without compensating complexity. For extraction, name sources, actual consumers, destination, and minimal useful contract. Preserve explicit policy, import boundaries, and all removed-code usages.

Keep distinct policy local, or when coupling/adaptation exceeds duplication cost. Partial substitution need not remove the enclosing helper/module.
