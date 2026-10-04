---
name: audit-coding-style
description: Make equivalent code follow the repository's established conventions while preserving behaviour.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Coding style audit

Make code with the same role follow one convention across files. Invocation authorises behaviour-preserving refactors; audit-only requests produce findings without edits. Paths narrow the scope; otherwise, review all first-party code. Keep unrelated staged and unstaged work.

Formatting, import order, and lint rules belong to Vite+. Types, errors, and async behaviour belong to TypeScript review; reuse belongs to the reusability audit; tests belong to the test audit.

## Scope

- **Naming:** files, symbols, predicates, verbs, event names, units, and domain terms.
- **Module structure:** package versus relative imports, entry points, re-exports, and the split between registration and core behaviour.
- **Control flow:** function forms, guard clauses, dispatch, parameters, and loop versus collection-method choices.

## Workflow

1. **Establish conventions.** In this order: user instructions and documented rules, configured tooling, then maintained code with the same role. Record each convention with its rule and `path:line` evidence. Occurrence count alone is not evidence; treat mixed evidence as a decision.
2. **Classify candidates** as refactor, keep (a real constraint justifies the difference), or decision needed (contract, serialized name, or behaviour change). Trace each rename through exports, consumers, mocks, and examples.
3. **Refactor** one convention at a time across all occurrences. Skip changes with no maintenance benefit.
4. **Verify and report** under [required verification](../../../../docs/agents/verification.md): conventions applied, keep decisions, open decisions, and the exact checks and results.
