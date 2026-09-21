# Pi compatibility

[pi-fff-guard](../README.md)

## Contracts to verify

- [ ] [Interception](../src/index.ts): official-package provenance, enabled tool names, hook dispatch, and `{ block: true, reason }`; no argument mutation, replacement search, or turn termination.
- [ ] [Inspection](../src/evaluate-search.ts): installed FFF schemas/normalization, explicit paths versus filters, ignore/symlink behavior, deadlines, and cancellation policy.

## Limitations and replacement opportunities

- [Direct `execute()` bypasses hooks](../README.md#limits). Revisit public nested-tool dispatch/interception APIs and actual FFF wrapper behavior.
- [FFF retirement criteria](../README.md#retirement): upstream ignored-path support could remove the guard; verify missing-path handling separately. This depends on the installed FFF release, not Pi alone.

## Validation

Use [package checks](../README.md#validation) and real installed FFF calls for changed integration contracts. Keep the README's external version evidence qualified; local tests do not establish external compatibility.
