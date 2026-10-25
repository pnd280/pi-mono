import { joinPromptParts, type PromptPartsAPI } from "@pi-mono/libs/prompt-parts";

/** After pi-model-prompt (100) and pi-profiles (200), so the result rules follow general rules. */
const RANK = 300;

/** The supervisor receives only the child's final reply; see `ChildRun.collect`. */
const RESULT_INSTRUCTIONS = [
  "You run as a subagent task. Your supervisor, another agent, receives only your final reply. It does not see your tool calls or intermediate messages.",
  "Make the final reply complete on its own: lead with the outcome, give evidence as file paths with line numbers or as the commands that you ran and their results, and state what you did not verify or finish."
].join("\n");

/** Call in the extension factory of a child process. */
export function joinChildPrompt(pi: PromptPartsAPI): void {
  joinPromptParts(pi, { id: "pi-subagents" }).part(RANK, () => RESULT_INSTRUCTIONS);
}
