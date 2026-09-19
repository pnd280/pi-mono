# Feedback

[Consistency audit](../SKILL.md)

Compare notifications and inline messages for equivalent outcomes, including operations that finish after a view closes.

## Checks

- Are severity, source identification, placement, duration, and next steps consistent with the outcome?
- Does the message say what happened and whether the user needs to act?
- Do nested layers produce duplicate notifications or contradictory success and failure messages?
- Are failed writes distinguished from committed writes with cleanup warnings?
- Do cancellation, timeout, unavailability, and failure retain distinct meanings?
- Does feedback preserve essential controls and remain accurate when the originating surface or session is no longer active?

## Evidence

Capture the complete message sequence for the operation, including severity and delivery location. Trace which layer owns each message. Use fixtures without private content, and distinguish a deliberate persistent diagnostic from an accidental duplicate.
