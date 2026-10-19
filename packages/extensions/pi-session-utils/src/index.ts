import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";

import { registerAutoTitle } from "./auto-title/index.ts";
import { registerSessionCommand } from "./commands.ts";
import { installParentSessionStartup } from "./startup.ts";

export default function piSessionUtils(pi: ExtensionAPI): void {
  const lifecycle = joinLifecycle(pi, { id: "pi-session-utils" });
  registerSessionCommand(pi, registerAutoTitle(pi, lifecycle));
  pi.registerFlag("parent-session", {
    description: "Start an empty child of a session file or exact session ID",
    type: "string"
  });
  installParentSessionStartup(pi);
}
