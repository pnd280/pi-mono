# Feedback

[User interface consistency audit](../SKILL.md)

Compare notifications/inline messages for equivalent outcomes, including post-closure completion.

## Checks

- Do severity, attribution, placement, duration, and next steps fit the outcome?
- Is the result and required user action clear?
- Do layers duplicate or contradict success/failure feedback?
- Are failed writes distinct from committed writes with cleanup warnings?
- Are cancellation, timeout, unavailability, and failure distinct?
- Does feedback preserve controls and remain accurate after surface/session expiry?

## Evidence

Capture complete message sequences, severities, and locations; trace ownership. Use nonprivate fixtures and distinguish intentional persistent diagnostics from duplicates.
