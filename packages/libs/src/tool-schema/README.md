# Tool schemas

[Library index](../../README.md#usage)

Pi tools declare model-facing parameters in TypeBox, but extensions validate input in Zod, and some providers reject parts of JSON Schema. [`toToolSchema`](index.ts) (`@pi-mono/libs/tool-schema`) projects a Zod input schema into Pi's TypeBox parameters in a limited schema profile, so that each tool describes its input once.

## Behaviour

The projection preserves the input TypeScript type, including optional and nullable fields, and can be composed inside `Type.Object` and `Type.Optional`.

The adapter uses one limited compatibility profile:

- It omits integer bounds, including Zod's automatic safe-integer bounds, because some providers reject them.
- Explicit integer bounds require a nonempty description on the bounded schema, field, or containing nullable, array, or record schema.
- It excludes hidden runtime metadata.
- Unsupported keywords, constrained record keys, and recursion fail tool construction rather than silently broadening inputs. The [projection implementation](index.ts) defines the exact supported keyword set.
- Refinements and transforms still belong to runtime parsing; the tool schema does not execute them.

Extend the profile only after checking the provider boundary.

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

## Caller responsibilities

- Keep feature schemas, descriptions, and validation errors in the consumer. State omitted numeric constraints in the required description; the adapter checks that a description exists, not what it says.
- Validate full inputs before side effects with the original Zod schema or equivalent domain validation. A projected TypeBox schema does not replace runtime validation.
- Use `z.strictObject` where unknown keys must be rejected. Express optionality in the containing Zod object, or with `Type.Optional` when composing TypeBox objects.
- For display consumers, follow [structural recognition guidance](../../../extensions/pi-tool-display/docs/adapters.md#recognise-tool-contracts) rather than treating the projected schema as a stable fingerprint.
- Check actual provider acceptance when changing the profile or supported providers. Local serialisation and argument-validation tests cannot establish live API compatibility.

## Validation

The profile has [no automated coverage](../../docs/testing.md#not-tested).

1. Check the [selective-read](../../../extensions/pi-read/README.md#validation) and [todo](../../../extensions/pi-todo/README.md#validation) consumers.
2. Check the [subagents](../../../extensions/pi-subagents/README.md#validation) consumer.

For schema changes, also run the [tool-display checks](../../../extensions/pi-tool-display/README.md#validation), including the installed-CLI test, because display adapter recognition inspects registered parameters.
