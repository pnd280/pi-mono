# Configuration

[Consistency audit](../SKILL.md)

Compare how settings views and diagnostics explain which values take effect. Recovery policies may differ when features have different risks or scopes.

## Checks

- Can the user identify the effective value, its scope, and any override?
- Are global defaults, trusted-project settings, and session-only changes distinguished?
- Do diagnostics accurately describe how invalid or unknown settings are handled, including silent fallbacks, recovery of individual fields, or disabled features?
- Are defaults, accepted values, normalization, and disabled states described consistently across documentation and UI?
- Is the reload or restart requirement clear, and does it match when settings are read?
- Do save messages identify the destination and distinguish a saved value from the effective value when another scope overrides it?

## Evidence

Use disposable settings with valid values, a relevant invalid field, and competing scopes. Record effective behavior as well as diagnostics. Recommend consistent explanations. Require identical fallback policies only when equivalent contracts justify them.
