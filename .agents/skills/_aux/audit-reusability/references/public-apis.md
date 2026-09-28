# Public API reuse

[Return to the reusability audit](../SKILL.md).

Use these checks when local behavior or types overlap platform or dependency APIs. Availability and contract equivalence are separate questions.

## Availability

- Identify APIs for the candidate's parsing, formatting, validation, path handling, resource management, construction, or UI behavior.
- Verify availability in the platform and dependency versions resolved by each affected consumer. Runtime and workspace dependency versions can differ.
- Inspect metadata, entry-point declarations, and `package.json` export maps for the exact specifier and symbol. An internal `export` or reachable `dist` file does not establish a supported public API, even without an export map.
- Probe uncertain value exports minimally. Inspect or type-check type-only exports rather than looking for them in runtime namespaces.

Record resolved versions and supported imports. Retain local code when no public alternative fits; missing availability evidence leaves a candidate unresolved. Never bypass package boundaries with internal deep imports.

## Contract fit

- Compare inputs, outputs, types, defaults, ownership, identity, mutation, lifecycle, cancellation, errors, limits, and side effects against declarations and implementation.
- Check whether handwritten types mirror an exported contract or intentionally narrow it. Use exported types or intentional derivations for the same contract, including inline parameter shapes.
- Preserve separators, empty values, sanitization, order, Unicode safety, IDs, borrowed arguments, and fresh versus shared state. Compare constructors separately from subsequent processing.
- Trace injected versus global state, environment overrides, filesystem access, process execution, credentials, and network behavior.
- Account for compensating wrappers, changed policy, and new dependencies. A required new dependency makes adoption a conditional refactor with its own cost and scope justification.

Record behavioral differences and evidence for each affected consumer. A successful import proves availability, not equivalence.
