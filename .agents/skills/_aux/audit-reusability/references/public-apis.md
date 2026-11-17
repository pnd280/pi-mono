# Public API reuse

[Return to the reusability audit](../SKILL.md).

Availability and contract equivalence are separate questions.

## Availability

- Identify APIs for the candidate's parsing, formatting, validation, path handling, resource management, construction, or UI behaviour.
- Verify availability in the platform and dependency versions resolved by each affected consumer. Runtime and workspace dependency versions can differ.
- Inspect metadata, entry-point declarations, and `package.json` export maps for the exact specifier and symbol. An internal `export` or reachable `dist` file does not establish a supported public API, even without an export map.
- Probe uncertain value exports minimally. Inspect or type-check type-only exports rather than looking for them in runtime namespaces.

## Contract fit

- Compare inputs, outputs, types, defaults, ownership, identity, mutation, lifecycle, cancellation, errors, limits, and side effects against declarations and implementation.
- Check whether handwritten types mirror an exported contract or intentionally narrow it. Use exported types or intentional derivations for the same contract, including inline parameter shapes.
- Preserve separators, empty values, sanitisation, order, Unicode safety, IDs, borrowed arguments, and fresh versus shared state. Compare constructors separately from subsequent processing.
- Trace injected versus global state, environment overrides, filesystem access, process execution, credentials, and network behaviour.
- Account for compensating wrappers, changed policy, and new dependencies.
