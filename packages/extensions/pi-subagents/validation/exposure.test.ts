import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import type { RpcRecord } from "../src/child/connection.ts";
import { withFixture } from "./background-fixture.ts";
import type { Supervisor } from "./supervisor.ts";

function notifies(text: string): (record: RpcRecord) => boolean {
  return (record) =>
    record.type === "extension_ui_request" &&
    record.method === "notify" &&
    record.message.includes(text);
}

async function lastText(host: Supervisor): Promise<string> {
  const reply = await host.request({ type: "get_last_assistant_text" });

  return reply.command === "get_last_assistant_text" ? (reply.data.text ?? "") : "";
}

test("keeps tools inactive that an earlier extension turned off at session start", async () => {
  await withFixture(
    async (directory, start) => {
      await writeFile(join(directory, "agent", "subagent-docs.md"), "FIXTURE_SUBAGENT_DOCS\n");
      const host = await start();
      await host.prompt("report-subagent-tools");
      expect(await lastText(host)).toBe("subagent tools: false false");
      await host.prompt("report-job-tools");
      expect(await lastText(host)).toBe("job tools: false false");
      // Controls: the four tools were active before the earlier extension turned them off, and
      // the session_start registration with the configured docs ran.
      expect(
        host.records.some(notifies("denied active tools: subagent subagent_abort job job_abort"))
      ).toBe(true);
      expect(host.records.some(notifies("FIXTURE_SUBAGENT_DOCS"))).toBe(true);
    },
    {
      settings: { "ext.pi-subagents": { jobs: true, maxDepth: 2, docs: ["subagent-docs.md"] } },
      earlierExtensions: [fileURLToPath(new URL("./deny-tools.ts", import.meta.url))]
    }
  );
});
