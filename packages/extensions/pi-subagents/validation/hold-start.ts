import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getDepth } from "../src/child/depth.ts";
import { assertFixtureWorkspace } from "./workspace.ts";

/**
 * Holds each child's session start while `start-hold` exists in the work directory, so that the
 * child does not acknowledge its run's `begin`. The poll also keeps the child's event loop alive.
 */
export default async function holdStart(pi: ExtensionAPI): Promise<void> {
  await assertFixtureWorkspace(process.cwd());
  if (getDepth() === 0) return;
  pi.on("session_start", async (_event, ctx) => {
    while (existsSync(join(ctx.cwd, "start-hold"))) await setTimeout(25);
  });
}
