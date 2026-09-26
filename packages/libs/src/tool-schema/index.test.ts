import { fauxToolCall, Type, validateToolArguments, type Static } from "@earendil-works/pi-ai";
import { expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";

import { toToolSchema } from "./index.ts";

it("omits integer bounds throughout nested schemas without changing the source schema", () => {
  const coordinate = z.int().min(1).describe("Positive safe integer");
  const input = z.strictObject({
    line: coordinate,
    column: coordinate.optional(),
    end: coordinate.nullable(),
    // Zod collapses this nullable into a type array because the member has no own metadata.
    previous: z.int().min(1).nullable().optional().describe("Positive previous line"),
    ranges: z.array(z.strictObject({ start: coordinate })),
    positions: z.record(z.string(), coordinate)
  });
  const parameters = Type.Object({ selection: Type.Optional(toToolSchema(input)) });
  const serialized = JSON.stringify(parameters);
  for (const keyword of ["~standard", "$schema", "minimum", "maximum"])
    expect(serialized).not.toContain(`"${keyword}"`);
  expect(JSON.parse(serialized)).toMatchObject({
    properties: {
      selection: {
        type: "object",
        required: ["line", "end", "ranges", "positions"],
        additionalProperties: false,
        properties: {
          line: { type: "integer", description: "Positive safe integer" },
          column: { type: "integer", description: "Positive safe integer" },
          previous: { type: ["integer", "null"], description: "Positive previous line" },
          ranges: { type: "array", items: { properties: { start: { type: "integer" } } } },
          positions: { type: "object", additionalProperties: { type: "integer" } }
        }
      }
    }
  });

  const tool = { name: "select", description: "Select source", parameters };

  for (const end of [null, 2]) {
    const args = { selection: { line: 1, end, ranges: [{ start: 1 }], positions: { mark: 2 } } };
    expect(validateToolArguments(tool, fauxToolCall("select", args))).toEqual(args);
  }

  expect(z.toJSONSchema(coordinate)).toMatchObject({
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER
  });
});

it("preserves enums, lengths, array limits, required fields, and strict object validation", () => {
  const parameters = toToolSchema(
    z.strictObject({
      action: z.enum(["create", "update"]),
      name: z.string().min(1).max(4).describe("Short name"),
      flags: z.array(z.boolean()).min(1).max(2),
      note: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  );
  const tool = { name: "example", description: "Example", parameters };
  const args = { action: "create", name: "Name", flags: [true], metadata: { count: 1 } };
  expect(validateToolArguments(tool, fauxToolCall("example", args))).toEqual(args);
  for (const invalid of [
    { ...args, action: "delete" },
    { ...args, name: "" },
    { ...args, name: "Too long" },
    { ...args, flags: [] },
    { ...args, flags: [true, false, true] },
    { ...args, flags: [{}] },
    { ...args, extra: true },
    { name: "Name", flags: [true] }
  ])
    expect(() => {
      validateToolArguments(tool, fauxToolCall("example", invalid));
    }).toThrow();
});

it("retains input types, optionality, and nullability when runtime parsing transforms values", () => {
  const parameters = toToolSchema(
    z.strictObject({
      text: z.string().transform((text) => text.length),
      parent: z.int().nullable().optional()
    })
  );
  const composed = Type.Object({ selection: Type.Optional(parameters) });
  expectTypeOf<Static<typeof composed>>().toEqualTypeOf<{
    selection?: { text: string; parent?: number | null | undefined };
  }>();
  expect(JSON.parse(JSON.stringify(parameters))).toMatchObject({
    properties: { text: { type: "string" } }
  });
});

it("preserves literal property names and values rather than treating them as schema keywords", () => {
  const parameters = toToolSchema(
    z.strictObject({
      minimum: z.string(),
      "~standard": z.boolean(),
      fixed: z.unknown().meta({ const: { minimum: 1 }, enum: [{ minimum: 1 }] })
    })
  );
  expect(JSON.parse(JSON.stringify(parameters))).toMatchObject({
    properties: {
      minimum: { type: "string" },
      "~standard": { type: "boolean" },
      fixed: { const: { minimum: 1 }, enum: [{ minimum: 1 }] }
    },
    required: ["minimum", "~standard", "fixed"]
  });
});

it.each([
  ["pattern", z.string().regex(/^x/)],
  ["format", z.email()],
  ["propertyNames", z.record(z.string().min(1), z.number())],
  ["minimum", z.number().min(1)],
  ["exclusiveMinimum", z.int().gt(1)],
  ["multipleOf", z.int().multipleOf(2)],
  ["prefixItems", z.tuple([z.string(), z.number()])],
  ["allOf", z.intersection(z.string(), z.literal("value"))],
  ["default", z.string().default("value")],
  ["x-provider", z.string().meta({ "x-provider": "custom" })]
])("rejects unsupported %s instead of silently weakening the profile", (keyword, value) => {
  expect(() => toToolSchema(z.strictObject({ value }))).toThrow(
    `Unsupported tool schema keyword "${keyword}"`
  );
});

it.each([
  ["properties.field", { properties: { field: { format: "email" } } }],
  ["items", { items: { format: "email" } }],
  ["additionalProperties", { additionalProperties: { format: "email" } }],
  ["anyOf.0", { anyOf: [{ format: "email" }] }]
])("rejects unsupported metadata-supplied schema keywords at %s", (path, metadata) => {
  expect(() => toToolSchema(z.unknown().meta(metadata))).toThrow(
    `Unsupported tool schema keyword "format" at <root>.${path}`
  );
});

it("projects integer bounds in metadata-supplied schemas without changing the metadata", () => {
  const metadata = {
    description: "Values from 1 to 10",
    items: { type: ["integer", "null"], minimum: 1, maximum: 10 }
  };
  const parameters = toToolSchema(z.array(z.unknown()).meta(metadata));
  expect(JSON.parse(JSON.stringify(parameters))).toEqual({
    type: "array",
    description: "Values from 1 to 10",
    items: { type: ["integer", "null"] }
  });
  expect(metadata.items).toEqual({ type: ["integer", "null"], minimum: 1, maximum: 10 });
});

it.each([
  ["properties.value", z.strictObject({ value: z.int().min(1) })],
  ["properties.value", z.strictObject({ value: z.int().max(3) }).describe("Other field")],
  ["properties.value.anyOf.0", z.strictObject({ value: z.int().min(1).nullable().optional() })],
  ["properties.value.anyOf.0", z.strictObject({ value: z.int().min(1).describe("").nullable() })],
  ["properties.value.items", z.strictObject({ value: z.array(z.int().min(1)) })],
  [
    "properties.value.additionalProperties",
    z.strictObject({ value: z.record(z.string(), z.int().min(1)) })
  ]
])("requires a description for omitted explicit integer bounds at %s", (path, input) => {
  expect(() => toToolSchema(input)).toThrow(`Integer bounds at <root>.${path} are omitted`);
});

it("accepts omitted bounds described by their field, nullable wrapper, or container", () => {
  const bounded = z.int().min(1);
  expect(() =>
    toToolSchema(
      z.strictObject({
        field: bounded.describe("Positive"),
        nullable: bounded.nullable().describe("Positive or null"),
        list: z.array(bounded).describe("Positive items"),
        record: z.record(z.string(), bounded).describe("Positive values"),
        implicit: z.int()
      })
    )
  ).not.toThrow();
});

it("rejects recursive schemas rather than emitting provider-dependent references", () => {
  const recursive: z.ZodType = z.lazy(() => z.object({ child: recursive.optional() }));
  expect(() => toToolSchema(recursive)).toThrow(/cycle/i);
});
