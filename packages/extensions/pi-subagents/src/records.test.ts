import { expect, test } from "vite-plus/test";

import { parseRecord } from "./records.ts";

const saved = {
  task_id: "task",
  parent_task_id: null,
  description: "Review",
  session_file: "/sessions/child.jsonl",
  session_id: "child",
  checkpoint: {
    version: 1,
    id: "00000000-0000-4000-8000-000000000000",
    file: "/checkpoints/task.json",
    digest: "0".repeat(64)
  },
  owner_session_id: "owner",
  model: "provider/model",
  thinking: "medium",
  background: false,
  state: "inactive",
  outcome: "completed"
} as const;

test.each([
  ["without run metadata", saved],
  [
    "with run metadata",
    {
      ...saved,
      started_at: 1_000,
      ended_at: 61_000,
      usage: { input: 12_000, output: 3_000, cache_read: 40_000, cache_write: 2_000, cost: 0.04 }
    }
  ]
])("keeps a saved task record %s", (_name, record) => {
  expect(parseRecord(record)).toEqual(record);
});
