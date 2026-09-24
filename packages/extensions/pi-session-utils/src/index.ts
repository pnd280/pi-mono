import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAutoTitle } from "./auto-title/index.ts";
import { registerSessionCommand } from "./commands.ts";
import { installParentSessionStartup } from "./startup.ts";

export default function piSessionUtils(pi: ExtensionAPI): void {
  registerSessionCommand(pi, registerAutoTitle(pi));
  pi.registerFlag("parent-session", {
    description: "Start an empty child of a session file or exact session ID",
    type: "string"
  });
  installParentSessionStartup(pi);
}
