# Tool schemas

[Library index](../../README.md#usage)

## Behavior

[`toToolSchema`](index.ts) (`@pi-mono/libs/tool-schema`) projects a Zod input schema into Pi's TypeBox parameters. It preserves the input TypeScript type, including optional and nullable fields, and can be composed inside `Type.Object` and `Type.Optional`.

The adapter uses one deliberately limited compatibility profile, not a universal provider schema standard:

| Treatment | Keywords or constructs                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve  | `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `anyOf`, `description`, `title`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| Omit      | Integer `minimum`/`maximum`, including Zod's automatic safe-integer bounds; the root `$schema` declaration; hidden runtime metadata such as `~standard`               |
| Simplify  | `propertyNames: { type: "string" }`, since JSON object keys are already strings                                                                                       |
| Reject    | All other keywords, constrained record keys, recursive schemas, and types Zod cannot represent as JSON Schema                                                         |

Conversion uses Zod's input view and inlines reused schemas. The profile applies to the finalized JSON Schema, including nested schemas supplied through Zod metadata; literal property names and `const`/`enum` values remain data. Unsupported keywords throw during tool construction with the keyword and schema path, instead of silently discarding constraints. Explicit integer bounds, unlike Zod's automatic safe-integer bounds, also throw unless the bounded schema, its field, or its containing nullable, array, or record schema has a non-empty description.

Refinements and transforms still belong to runtime parsing; the tool schema does not execute them. Extend the profile only after checking the provider boundary and adding coverage.

## Caller responsibilities

- Keep feature schemas, descriptions, and validation errors in the consumer. State omitted numeric constraints in the required description; the adapter checks that a description exists, not what it says.
- Validate full inputs before side effects with the original Zod schema or equivalent domain validation. A projected TypeBox schema is not a replacement for runtime validation.
- Use `z.strictObject` where unknown keys must be rejected. Optionality must be expressed in the containing Zod object or with `Type.Optional` when composing TypeBox objects.
- Preserve consumer-specific validation ordering, such as todo's metadata size preflight and replayable domain errors.
- For display consumers, follow [structural recognition guidance](../../../extensions/pi-tool-display/docs/adapters.md#recognize-tool-contracts) rather than treating the projected schema as a stable fingerprint.
- Check actual provider acceptance when changing the profile or supported providers. Local serialization and argument-validation tests cannot establish live API compatibility.

## Usage

```ts
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

const input = z.strictObject({
  line: z.int().min(1).describe("Positive safe-integer line number")
});
const parameters = toToolSchema(input);

// In execute(), before side effects:
const args = input.parse({ line: 1 });
```

## Validation

Use the [package validation commands](../../README.md#validation), then check the [selective-read](../../../extensions/pi-selective-read/README.md#validation) and [todo](../../../extensions/pi-todo/README.md#validation) consumers. Schema changes also require [tool-display checks](../../../extensions/pi-tool-display/README.md#validation), including its installed-CLI test, because display adapter recognition inspects registered parameters. Coverage is specified in the [library testing contracts](../../docs/testing.md#model-facing-schemas).
