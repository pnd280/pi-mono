# Over-testing

[Test audit](../SKILL.md)

Find coverage whose maintenance cost exceeds its incremental regression value. A small implementation can have many meaningful boundary cases; parameterized case counts and test-to-code line ratios are signals to inspect, not deletion criteria.

## Ownership

Trace the assertion to the layer that owns the contract:

- **Local behavior:** retain meaningful parsing, validation, policy, identity, mutation, and error cases at their owning unit.
- **Composition:** retain focused integration tests for registration, lifecycle, event interception, or host routing that unit tests cannot establish.
- **Delegation:** inspect tests of unchanged dependency behavior for removal. Adapters, wrappers, and monkey-patches can introduce local risks that still need coverage.

Checks at multiple layers are justified when they catch different defects. Similar assertions do not establish redundancy: a parser test and a real-host test may distinguish correct transformation from whether the hook runs before native expansion.

## Redundancy

For every proposed reduction, identify which distinction the discarded cases exercise and why it adds no unique local protection.

- Compare mode, input-position, source, delivery, and option matrices against local branches. Retain representatives of distinct branches and plausible boundary failures. Changing a mode label in an SDK fixture does not test CLI process output or exit; keep those process checks separately.
- Keep cheap table-driven edge cases when they distinguish matching, whitespace, trust, validation, or formatting contracts. Numerous rows are not equivalent to numerous heavyweight fixtures.
- Prefer one authoritative suite for each pure contract, with focused integration cases for its wiring. Before removing consumer regressions, verify that the owning suite covers their exact distinction; move missing cases there using the smallest fixture that exercises the boundary. Consumers still need checks of their configured budgets and integration.
- Remove instrumentation whose only purpose was checking persistence, queue delivery, native editing, or other delegated internals once those checks are removed.

Merging test names or moving parameterized cases into an assertion loop changes the reported count, not the coverage cost. Delete genuinely redundant scenarios and their setup; retain independent failure reporting for the rest.

For a package example, see [skill-reference coverage](../../../../packages/extensions/pi-skills/docs/testing.md): token rules belong in unit tests, while native expansion order and editor acceptance need host/editor tests. Its exclusions apply only where the extension delegates unchanged behavior to Pi.

## Evidence for removal

A finding is ready when it names the removed scenario, the owning implementation/API, retained tests for local risks, and fixture code that becomes unnecessary. Missing evidence about a plausible local failure keeps the candidate unresolved. A passing reduced suite alone does not prove that the removed coverage was redundant.

- Compare assertions and inputs, not names. Configuration tests may distinguish inheritance from rejection even when both use invalid settings.
- Use an independent expected result. Literal expectations or independent invariants catch defects that a copy of the implementation's algorithm could share. Byte-limit checks alone can accept empty output; assert useful content too. After removing spies, retain an assertion on the boundary outcome, such as the model and source received by a provider.
- Test lifecycle sequences, not just isolated results. Empty input followed by valid input can prove that an automatic attempt remains available. A value changed and then restored can require event-driven cancellation even when a final-value comparison passes. See [session-naming contracts](../../../../packages/extensions/pi-session-utils/docs/testing.md#naming).
- When uncertainty warrants it, use a focused counterexample or temporary fault injection to check that retained coverage detects the suspected defect. Restore production code afterward and rerun checks.
- Replace repeated fixture growth with a near-limit state only when the test still reaches the same limit and failure state. Keep stack-overflow, worker-memory, and cooperative-yield fixtures large enough to trigger the mechanism they protect.
- Keep differential tests of local implementations against independent dependency contracts, such as wrapping or fuzzy scoring. Shared protocol tests also do not replace consumer integration checks for cross-process lost updates or post-commit error mapping.
