import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { rewritePromptSection } from "./prompt-rewrites.ts";

export default function promptCloak(pi: ExtensionAPI): void {
  pi.on("context_with_system", (event) => {
    for (const message of event.messages) {
      if (message.role !== "system" || !message.sections) continue;

      for (const [name, content] of Object.entries(message.sections)) {
        if (typeof content === "string") {
          message.sections[name] = rewritePromptSection(name, content);
        }
      }
    }

    return { messages: event.messages };
  });
}
