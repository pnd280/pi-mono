# Over-testing and removal checks

[Return to the test audit](../SKILL.md).

Use when simplifying or removing tests; consult ownership when a candidate's contract owner is unclear.

## Test quality

Apply the shared [test-quality principles](../../../../../docs/agents/testing.md#test-quality) to candidate assertions. Bug-fix provenance alone establishes no unique regression value.

Assert meaningful boundary outcomes: byte-limit checks need useful-content assertions, and provider checks can verify the model and source received rather than internal calls.

## Ownership

Trace each assertion to its owning layer:

- **Local behavior:** retain parsing, validation, policy, identity, mutation, and error cases at their owning unit.
- **Composition:** retain focused integration checks for registration, lifecycle, event interception, and host routing that unit tests cannot establish.
- **Delegation:** consider removing checks of unchanged dependency behavior while preserving local adapter, wrapper, and monkey-patch risks. Identifying an owning API establishes ownership, not the existence of upstream tests.

Use one authoritative suite per pure contract, plus focused integration checks for wiring, configured budgets, and consumer policy. Before removing consumer regressions, verify that the owner suite covers their exact distinction; move missing cases there with a minimal boundary fixture.

Similar assertions across layers may catch different defects. Retain differential tests against dependency contracts and consumer integration checks for cross-process lost updates or post-commit error mapping.

## Redundancy

For each reduction, identify the discarded distinction and why it adds no unique local protection. Compare inputs and assertions, not test names or counts.

- Compare mode, position, source, delivery, and option matrices against distinct branches and plausible boundary failures. SDK mode labels do not exercise CLI process output or exit behavior.
- Retain cheap table-driven cases for matching, whitespace, trust, validation, and formatting distinctions. Inheritance and rejection can warrant separate cases even when both use invalid settings.
- Judge scaffolding cost separately from row counts and test-to-code ratios. Reduce scenarios and setup, preserving independent failure reporting; renamed tests or assertion loops alone reduce neither coverage cost nor redundancy.

## Evidence for removal

Record the removed scenario, owning implementation/API, retained tests for local risks or an evidenced exclusion, and fixture code made unnecessary. A passing reduced suite alone does not prove redundancy; missing evidence for a plausible local failure leaves the candidate unresolved.

- **Lifecycle sequences:** retain meaningful transitions, not just final values. Empty then valid input can prove an automatic attempt remains available; a value changed and restored can still require event-driven cancellation.
- **Stress mechanisms:** smaller near-limit fixtures must reach the same limit and failure state. Retain enough load to trigger stack overflow, worker-memory limits, or cooperative yielding.
- **Counterexamples:** resolve material uncertainty with focused offline probes or temporary fault injection. Verify that retained coverage detects the suspected defect, restore production code, and rerun checks.
