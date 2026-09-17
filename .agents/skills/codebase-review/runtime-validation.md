# Runtime integration and validation

## Pi integration

When Pi APIs or host integration are affected, verify them against the installed Pi documentation and relevant examples. Check event ordering, registration, cancellation, cleanup, reload, and resume where affected. Follow the [development guide's Pi API constraints](../../../docs/development.md#pi-apis).

For private hooks, inspect the installed implementation and verify assumptions, restoration order, and reversibility.

## Exercise affected behavior

Use package-specific validation instructions and choose checks for the actual change. Relevant Pi checks may include:

- Load, reload, resume, and unload, including repeated lifecycle transitions.
- Success, failure, cancellation, and repeated invocation.
- Expansion, terminal resizing, theme changes, and large or truncated output.
- Observable file writes, persistent state, or network behavior where affected.

Use disposable state for checks that write data. Respect the [testing convention's](../../../docs/agents/testing.md#boundaries) distinction between extension rendering adapters and reusable component contracts. Do not substitute snapshots for necessary interaction checks or build a new test harness without a concrete evidence gap. If the required runtime is unavailable, name the exact unverified behavior and missing prerequisite.
