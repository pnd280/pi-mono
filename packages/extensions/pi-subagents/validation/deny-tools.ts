import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { assertFixtureWorkspace } from "./workspace.ts";

const denied = ["subagent", "subagent_abort", "job", "job_abort"];

/**
 * Turns the four tools off at session start, as a deny profile would, and reports the active ones
 * it removed. Before each run, it reports the registered `subagent` description.
 */
export default async function denyTools(pi: ExtensionAPI): Promise<void> {
  await assertFixtureWorkspace(process.cwd());
  pi.on("session_start", (_event, ctx) => {
    const active = pi.getActiveTools();
    pi.setActiveTools(active.filter((name) => !denied.includes(name)));
    ctx.ui.notify(
      `denied active tools: ${denied.filter((name) => active.includes(name)).join(" ")}`
    );
  });
  pi.on("before_agent_start", (_event, ctx) => {
    const tool = pi.getAllTools().find(({ name }) => name === "subagent");
    ctx.ui.notify(`subagent description: ${tool?.description ?? "unregistered"}`);
  });
}
