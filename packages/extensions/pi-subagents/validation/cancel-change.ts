import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Another extension that cancels each tree navigation and fork. It loads after pi-subagents, so pi-subagents' handlers for the pre-events run before the cancel.
 */
export default function cancelChange(pi: ExtensionAPI): void {
  pi.on("session_before_tree", () => ({ cancel: true }));
  pi.on("session_before_fork", () => ({ cancel: true }));
}
