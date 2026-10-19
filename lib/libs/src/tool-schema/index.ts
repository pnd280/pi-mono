import { Type } from "@earendil-works/pi-ai";
import { z } from "zod";

// This is a deliberately limited tool-schema profile, not all of JSON Schema.
const supportedKeywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "description",
  "title",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems"
]);

type JSONSchema = z.core.JSONSchema.JSONSchema;

function isInteger(schema: JSONSchema): boolean {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];

  return types.includes("integer") && !types.includes("number");
}

function omitIntegerBounds(schema: JSONSchema): void {
  if (isInteger(schema)) {
    // Some providers reject even Zod's implicit safe-integer bounds.
    delete schema.minimum;
    delete schema.maximum;
  }
}

function hasExplicitBounds(schema: JSONSchema): boolean {
  return (
    isInteger(schema) &&
    ((schema.minimum !== undefined && schema.minimum !== Number.MIN_SAFE_INTEGER) ||
      (schema.maximum !== undefined && schema.maximum !== Number.MAX_SAFE_INTEGER))
  );
}

// Omitted caller-declared bounds must stay visible to the model through a description. A field's
// description covers its nullable members, array items, and record values.
function requireBoundDescriptions(
  schema: JSONSchema | boolean,
  path: string,
  described: boolean
): void {
  if (typeof schema === "boolean") return;
  const covered = described || (schema.description?.trim() ?? "") !== "";
  if (hasExplicitBounds(schema) && !covered)
    throw new Error(`Integer bounds at ${path} are omitted from tool schemas; describe them`);

  for (const [name, child] of Object.entries(schema.properties ?? {}))
    requireBoundDescriptions(child, `${path}.properties.${name}`, false);
  if (schema.additionalProperties !== undefined)
    requireBoundDescriptions(schema.additionalProperties, `${path}.additionalProperties`, covered);
  if (Array.isArray(schema.items))
    schema.items.forEach((child, index) =>
      requireBoundDescriptions(child, `${path}.items.${index}`, covered)
    );
  else if (schema.items !== undefined)
    requireBoundDescriptions(schema.items, `${path}.items`, covered);
  schema.anyOf?.forEach((child, index) =>
    requireBoundDescriptions(child, `${path}.anyOf.${index}`, covered)
  );
}

function projectSchema(schema: JSONSchema | boolean, path: string): void {
  if (typeof schema === "boolean") return;
  omitIntegerBounds(schema);

  const names = schema.propertyNames;
  // JSON object keys are already strings; Zod records can emit this redundant assertion.
  if (typeof names === "object" && names.type === "string" && Object.keys(names).length === 1)
    delete schema.propertyNames;

  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword))
      throw new Error(`Unsupported tool schema keyword "${keyword}" at ${path}`);
  }

  // Visit schema positions only; property names and const/enum values are data.
  for (const [name, child] of Object.entries(schema.properties ?? {}))
    projectSchema(child, `${path}.properties.${name}`);
  if (schema.additionalProperties !== undefined)
    projectSchema(schema.additionalProperties, `${path}.additionalProperties`);
  if (Array.isArray(schema.items))
    schema.items.forEach((child, index) => projectSchema(child, `${path}.items.${index}`));
  else if (schema.items !== undefined) projectSchema(schema.items, `${path}.items`);
  schema.anyOf?.forEach((child, index) => projectSchema(child, `${path}.anyOf.${index}`));
}

/** Project model-facing input only; callers must still validate before side effects. */
export function toToolSchema<Schema extends z.ZodType>(schema: Schema) {
  const options = { io: "input", cycles: "throw", reused: "inline" } as const;
  // Check before omission: compacted nullable integers lose the member that carried the bounds.
  requireBoundDescriptions(z.toJSONSchema(schema, options), "<root>", false);

  // Copy enumerable JSON fields only: TypeBox can expose Zod's hidden ~standard metadata.
  const { $schema: _dialect, ...parameters } = z.toJSONSchema(schema, {
    ...options,
    // Remove bounds early so Zod can still compact nullable integers into type arrays.
    override: ({ jsonSchema }) => omitIntegerBounds(jsonSchema)
  });
  // Zod overrides run before finalization and do not visit schemas supplied through metadata.
  projectSchema(parameters, "<root>");

  return Type.Unsafe<z.input<Schema>>(parameters);
}
