# Implementation and test review

Use the repository's [architecture](../../../docs/agents/architecture.md), [testing](../../../docs/agents/testing.md), and [development](../../../docs/development.md) conventions. Review affected consumers as well as the changed package.

## Code and architecture

Check the implementation against the requested behavior and existing contracts independently of its tests.

- **Correctness:** inspect meaningful inputs, boundary conditions, state transitions, error propagation, and required or forbidden side effects. Look for ignored inputs, swallowed errors, and inconsistent duplicated state.
- **Code organization and reuse:** search existing shared code and Pi APIs before proposing new abstractions. Check that substantial behavior is callable without a Pi session, module placement follows the architecture rules, and shared changes account for every affected consumer.
- **Readability and navigation:** follow an affected entry point through its behavior and side effects. Check names, dependency direction, cohesive responsibilities, and whether a maintainer can locate the relevant code without the implementation conversation. Split modules by responsibility, not a line-count threshold.
- **Unnecessary complexity:** question redundant wrappers, speculative extension points, duplicate implementations, incidental configuration, and abstractions with no concrete use. Prefer a simpler implementation when it preserves the contract and is easier to understand.
- **Performance:** inspect affected hot paths for repeated work, blocking I/O, unbounded state, retained resources, and unnecessary rendering. Measure suspected material regressions with representative inputs before adding optimization complexity; report unmeasured concerns as such.

## Tests and evidence

Load `software-testing/SKILL.md` from the configured companion skill locations. Apply it within the established scope and the repository's coverage boundaries; load only its applicable reference branches.
