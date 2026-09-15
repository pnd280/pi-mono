import { privateScopedDirectory } from "@pi-mono/libs/private-files";

import { PromptError } from "../model.ts";

export async function collectionDirectory(agentDir: string, hash: string): Promise<string> {
  if (process.platform !== "linux" && process.platform !== "darwin")
    throw new PromptError("Prompt storage supports Linux, macOS, and WSL local filesystems only.");

  return privateScopedDirectory({ root: agentDir, namespace: "pi-prompt-manager", key: hash });
}
