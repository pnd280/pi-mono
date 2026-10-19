import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ArgumentSchema = {
  required?: string[];
  allOf?: ArgumentSchema[];
  anyOf?: ArgumentSchema[];
  oneOf?: ArgumentSchema[];
  $ref?: unknown;
  if?: unknown;
  dependencies?: unknown;
  dependentRequired?: unknown;
  dependentSchemas?: unknown;
};

function requiredNames(schema: ArgumentSchema): string[] | undefined {
  // These schemas need resolution or evaluation before a name can be treated as optional.
  if (
    schema.$ref !== undefined ||
    schema.if !== undefined ||
    schema.dependencies !== undefined ||
    schema.dependentRequired !== undefined ||
    schema.dependentSchemas !== undefined
  ) {
    return undefined;
  }

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
