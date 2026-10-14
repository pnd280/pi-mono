import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
      pi
        .getAllTools()
        .map((tool) => [tool.name, (tool.parameters as { required?: string[] }).required ?? []])
    );
    const content = message.content.map((block) => {
      const names = block.type === "toolCall" ? required.get(block.name) : undefined;
      if (block.type !== "toolCall" || !names) return block;

      // An optional argument meant as the literal text "null" is dropped too; no tool needs one.
      const args = Object.entries(block.arguments).filter(
        ([name, value]) => value !== "null" || names.includes(name)
      );

      return { ...block, arguments: Object.fromEntries(args) };
    });

    return { message: { ...message, content } };
  });
}
