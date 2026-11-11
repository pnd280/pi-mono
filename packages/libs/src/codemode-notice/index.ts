import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/** The sentence that a wrapped tool's description ends with while `codemode` is declared. */
export const codemodeNotice = "Call this tool directly. It is not available inside codemode.";

/**
 * Returns `definition` with a `prepareLoadout` hook that adds {@link codemodeNotice} to its model-facing description while a tool named `codemode` is declared to the model.
 */
export function withCodemodeNotice<T extends Pick<ToolDefinition, "name" | "description">>(
  definition: T
): T & Required<Pick<ToolDefinition, "prepareLoadout">> {
  const description = `${definition.description}\n\n${codemodeNotice}`;

  return {
    ...definition,
    prepareLoadout: (loadout) =>
      loadout.declared.some((tool) => tool.name === "codemode")
        ? { descriptions: { [definition.name]: description } }
        : undefined
  };
}
