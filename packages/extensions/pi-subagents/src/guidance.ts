/** Adapted from OpenCode's task.txt at 907b3bc; Pi children have no agent definitions. */
export function toolGuidance(): string {
  return [
    "Launch a new agent to handle complex, multistep tasks autonomously.",
    "Do not delegate small lookups, such as a known file, symbol, or a narrow search.",
    "Launch independent tasks concurrently with multiple tool calls. Do not duplicate delegated work.",
    "Children share your working directory. Parallel tasks must not edit the same files.",
    "Each new task has a fresh conversation. Supply a detailed prompt, the expected final answer, whether to write code or research, and relevant verification commands.",
    "Use task_id to continue a task with its previous context.",
  ].join("\n\n");
}
