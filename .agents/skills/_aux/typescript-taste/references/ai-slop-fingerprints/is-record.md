# `isRecord` guard sprawl

[Object guard patterns](index.md)

Prefer preserving established domain types through internal function signatures instead of repeatedly narrowing `unknown` or `Record<string, unknown>`.

A typical implementation is:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

This checks for a non-null, non-array object. It does not validate required fields, a domain schema, or plain-object semantics: `Date`, `Map`, and class instances also pass. The name `isRecord` alone does not establish which constraints a predicate checks.

## Questions to consider

- Does internal code accept `unknown` or `Record<string, unknown>` where its producers already establish a specific domain type?
- Do consumers repeatedly reconstruct the same contract through `isRecord` and property checks instead of preserving a validated type?
- Do fallbacks such as `undefined`, `{}`, or `[]` conceal invalid input or broken invariants rather than implement documented recovery?
- Do duplicated guards establish the same type and runtime constraints?
- Is an object check being treated as proof of a domain schema, plain object, or safe property access that it does not establish?

`isRecord` can be useful for narrowing genuinely unknown values during boundary validation. TypeScript annotations alone do not validate runtime input.

## Preserving domain types

Prefer boundary parsers that validate input and return a domain type, then preserve that type through internal function signatures. A cast from `unknown` does not replace parsing. Unchecked casts, untyped callers, or later mutation can undermine the guarantees that would otherwise make internal guards redundant.

## Example

For an internal function whose callers already supply validated `User` values:

```ts
type User = { name: string };

function userLabel(user: User): string {
  if (!isRecord(user)) return "Unknown";
  if (typeof user.name !== "string") return "Unknown";
  return user.name;
}
```

After verifying those callers and the boundary validation, the internal function can use its contract directly:

```ts
function userLabel(user: User): string {
  return user.name;
}
```

The input parser still validates external values. If this function itself receives untrusted input, retain that responsibility or move it to an explicit parser before simplifying the consumer.
