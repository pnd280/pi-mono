import assert from "node:assert/strict";

import { it } from "vite-plus/test";

import { compactionStatusKey, compactionStatusText, updateCompactionStatus } from "./status.ts";

function fixture(types: string[], hasUI = true) {
  const calls: [string, string | undefined][] = [];

  return {
    calls,
    ctx: {
      hasUI,
      sessionManager: {
        getBranch() {
          assert.ok(hasUI, "headless hosts must not read the branch for UI status");

          return types.map((type) => ({ type }));
        }
      },
      ui: {
        get theme() {
          assert.ok(hasUI, "headless hosts may have no initialized theme");

          return { fg: (_color: "dim", text: string) => `<dim>${text}</dim>` };
        },
        setStatus: (key: string, text: string | undefined) => calls.push([key, text])
      }
    }
  };
}

it("hides the status until a compaction succeeded", () => {
  assert.equal(compactionStatusText(0), undefined);
  assert.equal(compactionStatusText(3), "compacted 3×");
});

it("counts only compaction entries on the branch", () => {
  const { calls, ctx } = fixture([
    "message",
    "compaction",
    "branch_summary",
    "custom",
    "compaction"
  ]);

  updateCompactionStatus(ctx);
  assert.deepEqual(calls, [[compactionStatusKey, "<dim>compacted 2×</dim>"]]);
});

it("clears the status for a session without compactions", () => {
  const { calls, ctx } = fixture(["message"]);

  updateCompactionStatus(ctx);
  assert.deepEqual(calls, [[compactionStatusKey, undefined]]);
});

it("leaves headless hosts untouched", () => {
  const { calls, ctx } = fixture(["compaction"], false);

  updateCompactionStatus(ctx);
  assert.deepEqual(calls, []);
});
