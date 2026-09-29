# Pi compatibility

[pi-fff-guard](../README.md)

## Contracts to verify

- [ ] [Interception](../src/index.ts): official-package provenance, enabled tool names, hook dispatch, and `{ block: true, reason }`; no argument mutation, replacement search, or turn termination.
- [ ] [Inspection](../src/evaluate-search.ts): installed FFF schemas/normalization, explicit paths versus filters, ignore/symlink behavior, deadlines, and cancellation policy.

## Limitations and replacement opportunities

- [Direct `execute()` bypasses hooks](../README.md#limits). Revisit public nested-tool dispatch/interception APIs and actual FFF wrapper behavior.
- Upstream ignored-path support could remove the guard; follow the [retirement checks](#retirement-checks) against the installed FFF release, not Pi alone.

## Retirement checks

After a released FFF version implements [FFF #714](https://github.com/dmtrKovalenko/fff/issues/714):

1. Disable the guard.
2. Check ignored-file, ignored-directory, and linked-dependency searches for every tool in use.
3. If they pass, check missing explicit paths before retiring the guard; retain separate path validation if needed.

## Validation

Use [package checks](../README.md#validation) and real installed FFF calls for changed integration contracts. Keep the README's external version evidence qualified; local tests do not establish external compatibility.
