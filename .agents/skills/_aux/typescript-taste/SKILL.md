---
name: typescript-taste
description: Personal TypeScript preferences
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# TypeScript taste

## Sources of truth

Infer types from the implementation or the canonical schema, and derive shared types from that source rather than mirror it. Write explicit types for public contracts, deliberate inference constraints, or materially better diagnostics.

Check a separately declared API or configuration fragment at its declaration with `satisfies` when it is later spread into or passed to a typed boundary. Inference alone leaves the intended contract unchecked, so a mistake surfaces at the use site or not at all. `satisfies` checks the contract and excess keys where the object is declared, and keeps the narrower inferred type:

```ts
type Settings = { theme: "light" | "dark" };
declare function applySettings(settings: Settings): void;

const inferred = { theme: "dark" }; // { theme: string }
applySettings(inferred); // error at the use site

const checked = { theme: "dark" } satisfies Settings; // { theme: "dark" }
applySettings(checked); // compiles

const misspelt = { thme: "dark" } satisfies Settings; // error: 'thme' is not in Settings
```

A literal that must name a member of an existing union, such as an event, entry, or message `type` in a membership check, takes its type from that union: type the collection with the union, or compare with `===`, so that a misspelt or renamed member fails to compile. A plain array literal widens to `string[]` and accepts any string, and `as const` narrows the array to its own members and then rejects the wider argument:

```ts
type Status = "draft" | "published" | "archived";
declare const status: Status;

["publshed"].includes(status); // compiles: the typo goes unnoticed
(["published"] as const).includes(status); // error: Status is wider than "published"

const visible: ReadonlySet<Status> = new Set(["published"]);
visible.has(status); // compiles, and a typo in the set fails
status === "publshed"; // error: no overlap with Status
```

## Trust boundaries

A boundary is where a value arrives from outside the type checker's reach: I/O, `JSON.parse`, or a published or untyped API. A workspace package that is type-checked with its callers under the same configuration is inside the boundary. Settle which case applies from the callers: who imports the code, and whether the package is published.

Parse, don't validate: at a boundary, a parser takes `unknown` and returns a domain type. Prefer narrowing, validation, or better modelling to a cast. Keep an unavoidable `any` local to its interoperability gap, and back each `any` or assertion with evidence: a runtime check or a concrete boundary assumption. A casting wrapper earns its place when it centralises a documented boundary assumption or a meaningful domain operation.

A sound type predicate or parser proves at runtime every constraint of the type that it claims. A non-null object check establishes `object`, not a plain object or `Record<string, unknown>`:

```ts
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;
```

## Past the boundary

The parsed type is the evidence: internal signatures take the domain type, and internal code uses it without checking again. Shotgun parsing is the smell, internal code that proves again what its input type already states:

- A parameter typed `unknown` or `Record<string, unknown>` although its producers supply a domain type.
- `isRecord` or `typeof` property checks on a value that is already typed.
- The same guard defined again in another file.

For callers that already supply a parsed `User`, this:

```ts
function userLabel(user: User): string {
  if (!isRecord(user)) return "Unknown";
  if (typeof user.name !== "string") return "Unknown";
  return user.name;
}
```

becomes:

```ts
function userLabel(user: User): string {
  return user.name;
}
```

Before you remove a guard, verify that every caller supplies the parsed type: an unchecked cast, an untyped caller, or later mutation makes the guard load-bearing. A function that itself receives untrusted input is a boundary; keep its check, or move it into an explicit parser.

## Fallbacks

Return a fallback value such as `undefined`, `{}`, `[]`, or `"Unknown"` only where recovery is documented. Elsewhere, let invalid input or a broken invariant fail visibly.

## Shapes and arguments

Default to `type` for ordinary aliases and closed object shapes. Use `interface` for a deliberately open contract (declaration merging, module augmentation, an independently extended registry) or an established project class contract.

Take an object parameter when names distinguish several meaningful inputs or stabilise optional or evolving fields. A short conventional sequence stays positional, especially when migration cost outweighs call-site clarity.
