# Over-testing

[Return to the test audit](../SKILL.md).

Compare maintenance cost with incremental regression value. Parameterized case counts and test-to-code line ratios are inspection signals, not deletion criteria: small implementations can have many meaningful boundary cases.

## Ownership

Trace each assertion to the layer that owns its contract:

- **Local behavior:** retain meaningful parsing, validation, policy, identity, mutation, and error cases at their owning unit.
- **Composition:** retain focused integration tests for registration, lifecycle, event interception, or host routing that unit tests cannot establish.
- **Delegation:** consider removing checks of unchanged dependency behavior while preserving local risks introduced by adapters, wrappers, and monkey-patches.

Use one authoritative suite per pure contract, plus focused integration cases for wiring, configured budgets, and consumer policy. Before removing consumer regressions, verify that the owner suite covers their exact distinction; move missing cases there with the smallest fixture that exercises the boundary.

Similar assertions at different layers can catch different defects. For example, [skill-reference coverage](../../../../packages/extensions/pi-skills/docs/testing.md) separates token rules from native expansion order and editor acceptance. Its exclusions apply only where the extension delegates unchanged behavior to Pi.

## Redundancy

For every proposed reduction, identify the discarded distinction and explain why it adds no unique local protection.

- Compare mode, input-position, source, delivery, and option matrices against local branches. Retain representatives of distinct branches and plausible boundary failures. Changing a mode label in an SDK fixture does not exercise CLI process output or exit; preserve those process checks separately.
- Keep cheap table-driven edge cases that distinguish matching, whitespace, trust, validation, or formatting contracts. Rows do not carry the same cost as heavyweight fixtures.
- Compare assertions and inputs, not names. Configuration tests can distinguish inheritance from rejection even when both use invalid settings.
- Remove instrumentation used only for discarded checks of persistence, queue delivery, native editing, or other delegated internals.

Delete genuinely redundant scenarios and setup while retaining independent failure reporting. Merging names or moving cases into assertion loops changes reported counts rather than coverage cost.

## Evidence for removal

A reduction needs the removed scenario, owning implementation/API, retained tests for local risks, and fixture code made unnecessary. Missing evidence about a plausible local failure leaves it unresolved; a passing reduced suite alone does not prove redundancy.

- **Independent expectations:** use literal results or independent invariants rather than copying the implementation's algorithm. Byte-limit checks also need useful-content assertions. After removing spies, assert the boundary outcome, such as the model and source received by a provider.
- **Lifecycle sequences:** test transitions as well as final values. Empty input followed by valid input can prove an automatic attempt remains available. A value changed and restored can require event-driven cancellation even if final-value comparison passes. See [session-naming contracts](../../../../packages/extensions/pi-session-utils/docs/testing.md#naming).
- **Counterexamples:** when uncertainty warrants it, use a focused counterexample or temporary fault injection to verify that retained coverage detects the suspected defect. Restore production code and rerun checks afterward.
- **Stress mechanisms:** replace repeated fixture growth with near-limit state only if it reaches the same limit and failure state. Keep stack-overflow, worker-memory, and cooperative-yield fixtures large enough to trigger the protected mechanism.
- **Independent boundaries:** retain differential tests against dependency contracts, such as wrapping or fuzzy scoring. Shared protocol tests do not replace consumer integration checks for cross-process lost updates or post-commit error mapping.
