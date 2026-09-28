# Feedback

[Return to the UI consistency audit](../SKILL.md).

Compare notifications and inline messages for equivalent outcomes, including completion after a surface closes.

## Checks

- Match severity, attribution, placement, duration, and next steps to the outcome.
- State the result and any required user action clearly.
- Trace success/failure feedback across layers to identify duplicates or contradictions; retain intentional persistent diagnostics.
- Distinguish failed writes from committed writes with cleanup warnings.
- Distinguish cancellation, timeout, unavailability, and failure.
- Preserve controls and keep feedback accurate after a surface or session expires.

## Evidence

Use nonprivate fixtures to capture complete message sequences, severities, and locations. Trace message ownership and identify where any duplication or contradiction originates.
