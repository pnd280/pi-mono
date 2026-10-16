import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import subagents from "../src/index.ts";
import { PENDING_RESULT_CHANNEL } from "./provider.ts";

/** pi-subagents for fixture workspaces: it reports each pending background result to the provider. */
export default function fixtureSubagents(pi: ExtensionAPI): void {
  subagents(pi, () => pi.events.emit(PENDING_RESULT_CHANNEL, undefined));
}
