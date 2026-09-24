# Coding pattern checklist

[Return to the coding style audit](../SKILL.md).

Use each applicable category to compare implementations with the same role and constraints. These prompts identify differences and semantic risks; the audit's convention ledger determines which differences warrant changes.

## Naming and vocabulary

- Compare filenames, modules, exported/local symbols, boolean predicates, action verbs, event names, and units across equivalent roles.
- Prefer established domain terms; distinguish values, factories, asynchronous actions, parsers, and validators where the codebase does.
- Trace renames through exports, consumers, mocks, examples, case-sensitive paths, and dynamic lookup. Serialized keys, host callbacks, command names, and external contracts may intentionally retain different names.

## Imports, exports, and module structure

- Compare package-name versus relative imports, type-only imports, extensions, grouping, entry points, re-exports, and supported public subpaths.
- Compare registration/adapters versus core behavior, declaration ordering, side-effect placement, and test/validation separation.
- Preserve initialization order, side-effect imports, acyclic dependencies, public export boundaries, and consumer-owned policy. Add a barrel only for an established entry-point contract.

## Types and data modeling

- Compare interfaces/type aliases in equivalent roles, inference versus explicit annotations, discriminated unions, optional fields, nullability, readonly ownership, generics, assertions, and type guards.
- Compare schema-derived types and runtime validation at equivalent trust boundaries. Reuse owned contracts instead of maintaining handwritten copies.
- Check assignability, declaration merging, exhaustiveness, mutation, and exported signatures before unifying syntax. Missing fields, explicit `undefined`, and `null` can differ; assertions are not validation.

## Functions and control flow

- Compare function declarations/expressions, guard clauses, branching, dispatch, parameter/default patterns, destructuring, and return conventions.
- Compare loops and collection operations by intent, not brevity. Prefer the established readable pattern when semantics match.
- Preserve `this`, hoisting, evaluation order, short-circuiting, iteration order, allocation/identity, mutation, and complexity. `||` and `??`, truthiness and presence checks, and `map` and `forEach` are not interchangeable.

## Errors, validation, and recovery

- Compare throwing versus result values, catch boundaries, error normalization, contextual messages, logging ownership, fallback behavior, and validation failure policy.
- Distinguish expected absence, cancellation, invalid input, and operational failures. Different boundaries may legitimately expose different failure contracts.
- Preserve error identity/cause, recoverability, propagation, redaction, user-visible wording, and fallback policy. Keep logging with its owner and validation details within the intended trust boundary.

## Asynchronous work and resource ownership

- Compare `async`/`await` and promise chains, sequential/concurrent execution, fire-and-forget handling, cancellation, retries, cleanup, listeners, timers, and disposal.
- Identify who owns startup, shutdown, settlement, and resource release before normalizing lifecycle code.
- Preserve concurrency limits, error timing, cancellation propagation, stack/finally behavior, and cleanup order. Adding/removing `await`, replacing loops with `Promise.all`, or marking a promise `void` can change behavior rather than just style.

## State, collections, and boundaries

- Compare initialization/reset, immutable updates versus mutation, lookup structures, caches, constants, sentinels, units, limits, paths, and environment access.
- Compare use of existing filesystem, configuration, persistence, and host adapters at equivalent boundaries.
- Preserve identity, ordering, normalization, cache lifetime, atomicity, platform behavior, and exact stored/raw values. Check similar-looking wrappers for deliberate policy before proposing reuse.

## Tests and fixtures

- Compare test naming/grouping, parameterization, runner imports, assertion idioms, async expectations, fixtures, fakes, and teardown for equivalent contracts.
- Prefer the workspace's existing test boundaries and fixtures when they fit. Keep production patterns and test-specific conveniences distinct.
- Preserve distinct scenarios, isolation, discovery, failure sensitivity, and cleanup. Evaluate snapshot or mock changes by the behavior they protect, not visual uniformity.

## Tooling, formatting, and code examples

- Compare formatter/linter ownership, package scripts, compiler settings, configuration shape, comments, and maintained code examples.
- Use configured tooling for whitespace, quotes, semicolons, and import sorting. Investigate configuration conflicts or ignored files instead of claiming checks covered them.
- Keep comments about constraints and decisions; update examples affected by a refactor. Limit prose edits to affected guidance. Propose shared rule/configuration changes separately with their own scope and verification.
