---
name: typescript-taste
description: Personal TypeScript preferences
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

## Sources of truth

The preference is to infer types from the implementation or canonical schema and derive shared types rather than maintain mirrors. Explicit types are welcome for public contracts, intentional inference constraints, or materially better diagnostics.

For a separately declared API/configuration fragment that will later be spread into or passed to a typed boundary, prefer checking it at its declaration with `satisfies`. Inference alone does not check the intended contract; `satisfies` checks compatibility and catches excess keys on fresh object literals while retaining useful inference. It performs no runtime validation.

## Trust boundaries

At untrusted boundaries, prefer `unknown` followed by narrowing or validation. The owner favors keeping unavoidable `any` local to an interoperability gap, with runtime evidence or a concrete boundary assumption explaining each `any` or assertion. Narrowing, validation, or better modeling are preferred to casts; a casting wrapper is useful when it centralizes a documented boundary assumption or meaningful domain operation.

A sound type predicate proves its claimed narrowing at runtime. A non-null object check establishes `object`, not a plain object or `Record<string, unknown>`:

```ts
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;
```

A stronger predicate needs checks for the additional constraints it claims. Type annotations and assertions supply no runtime evidence.

## Shapes and arguments

The owner's default is `type` for ordinary aliases and closed object shapes, and `interface` for deliberately open contracts—declaration merging, module augmentation, independently extended registries—or established project class contracts.

Object parameters are preferred when names distinguish several meaningful inputs or stabilize optional/evolving fields. Short conventional sequences can stay positional, especially when migration cost outweighs call-site clarity.

## Object guards

Prefer preserving validated domain types over repeatedly reconstructing them with object and property checks. See [object guard patterns](references/ai-slop-fingerprints/index.md).
