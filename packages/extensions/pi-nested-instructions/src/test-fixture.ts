import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fauxAssistantMessage, type JsonObject } from "@earendil-works/pi-ai";
import { SessionManager, type SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";

import type { Invocation } from "./scopes.ts";

export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "pi-nested-instructions-"));
  const cwd = path.join(root, "work");
  await mkdir(cwd);
  const manager = SessionManager.inMemory(cwd);
  let sequence = 0;

  return {
    root,
    cwd,
    manager,
    async write(name: string, content = name) {
      const file = path.resolve(cwd, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);

      return file;
    },
    call(toolName: string, input: JsonObject, sourceInfo?: Invocation["sourceInfo"]): Invocation {
      const toolCallId = `call-${++sequence}`;
      manager.appendMessage(
        fauxAssistantMessage([
          { type: "toolCall", name: toolName, arguments: input, id: toolCallId }
        ])
      );

      return { toolCallId, toolName, input, ...(sourceInfo ? { sourceInfo } : {}) };
    },
    append(entries: SessionBoundaryDraft[]) {
      return entries.map((entry) => {
        if (entry.type === "custom") return manager.appendCustomEntry(entry.customType, entry.data);
        if (entry.type === "custom_message")
          return manager.appendCustomMessageEntry(
            entry.customType,
            entry.content,
            entry.display,
            entry.details
          );
        throw new Error("Unexpected fixture entry");
      });
    },
    dispose: () => rm(root, { recursive: true, force: true })
  };
}
