# Public API reuse

[Reusability audit](../SKILL.md)

Compare local behavior/types with supported platform and installed public APIs. Availability or similar names do not prove equivalence.

## Checks

- Does a supported API already provide the parsing, formatting, validation, path handling, resource management, construction, or UI behavior?
- Is the API available in the platform and dependency versions actually resolved by affected consumers? Runtime and workspace dependency versions may differ.
- Is the symbol exported through a public package root or supported subpath? Check entry-point declarations and `package.json` export maps. An internal `export` or a reachable `dist` file in a package without an export map does not establish a supported API.
- Does a handwritten type represent the same exported contract or deliberately narrow it? Prefer the exported type or an intentional derivation over a separately maintained mirror, including inline parameter shapes.
- Do inputs, return types, defaults, data ownership, lifecycle, and side effects match? Include injected versus global state, environment overrides, filesystem access, process execution, credentials, and network behavior.
- Does adoption remove duplication without adding compensating wrappers, policy changes, or dependencies? Adding a dependency is a conditional refactor with a separate cost and scope justification, not a direct substitution.

## Evidence

Record resolved versions, exact imports, and symbols; inspect declarations, implementation, and metadata. Probe uncertain value exports minimally; inspect/type-check type-only exports rather than runtime namespaces. Missing availability/contract evidence remains unresolved.

Preserve separators, empty values, sanitization, order, Unicode safety, limits, IDs, borrowed arguments, and fresh/shared state. Check constructors and subsequent processing separately. Successful imports prove availability, not equivalence.

Never bypass exports or use internal deep imports to remove helpers. Mark unsupported replacements unavailable; retain local code without public alternatives. Also apply [Pi-specific checks](pi-apis.md).
