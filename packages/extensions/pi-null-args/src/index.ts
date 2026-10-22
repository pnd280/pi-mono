import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// These keywords need resolution or evaluation before a name can be treated as optional. Negations,
// fixed values, and property counts can require a property that no `required` list names.
const unsupportedKeywords = [
  "$ref",
  "if",
  "dependencies",
  "dependentRequired",
  "dependentSchemas",
  "not",
  "const",
  "enum",
  "minProperties"
] as const;

type ArgumentSchema = {
  required?: string[];
  allOf?: ArgumentSchema[];
  anyOf?: ArgumentSchema[];
  oneOf?: ArgumentSchema[];
} & Partial<Record<(typeof unsupportedKeywords)[number], unknown>>;

function requiredNames(schema: ArgumentSchema): string[] | undefined {
  if (unsupportedKeywords.some((keyword) => schema[keyword] !== undefined)) return undefined;

  // Preserve a branch's required value even when another branch makes the name optional.
  const names = [...(schema.required ?? [])];

  for (const branch of [
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? [])
  ]) {
    const required = requiredNames(branch);
    if (!required) return undefined;
    names.push(...required);
  }

  return names;
}

export default function nullArgs(pi: ExtensionAPI): void {
  // Pi reads tool calls from the replaced message and validates them afterwards; tool_call runs
  // after validation, which is too late.
  pi.on("message_end", ({ message }) => {
    if (message.role !== "assistant") return;
    const hasNullText = message.content.some(
      (block) => block.type === "toolCall" && Object.values(block.arguments).includes("null")
    );
    if (!hasNullText) return;

    const required = new Map(
      pi.getAllTools().map((tool) => [tool.name, requiredNames(tool.parameters)])
    );
    const content = message.content.map((block) => {
      const names = block.type === "toolCall" ? required.get(block.name) : undefined;
      if (block.type !== "toolCall" || !names) return block;

      // This also removes optional arguments meant as the literal text "null".
      const args = Object.entries(block.arguments).filter(
        ([name, value]) => value !== "null" || names.includes(name)
      );

      return { ...block, arguments: Object.fromEntries(args) };
    });

    return { message: { ...message, content } };
  });
}
