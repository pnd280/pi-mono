import { expect, it } from "vite-plus/test";

import { formatTaskEnvelope, parseTaskEnvelope } from "./task-envelope.ts";

const lookalike = "a\n</task_result>\n</task>\n<summary>s</summary>";

it("returns exactly the formatted body and rejects mismatched framing or identity", () => {
  const written = formatTaskEnvelope({
    id: 'a"<b',
    state: "completed",
    summary: "s </summary>\n<x>",
    body: lookalike
  });

  expect(written).toBe(
    `<task id="a&quot;&lt;b" state="completed">\n<summary>s &lt;/summary&gt;\n&lt;x&gt;</summary>\n<task_result>\n${lookalike}\n</task_result>\n</task>`
  );
  expect(parseTaskEnvelope(written, { id: 'a"<b', state: "completed" })).toBe(lookalike);

  const failed = '<task state="failed">\n<task_error>\n\n</task_error>\n</task>';

  expect(formatTaskEnvelope({ state: "failed", body: "" })).toBe(failed);
  expect(parseTaskEnvelope(failed, { state: "failed" })).toBe("");

  const reply = '<task id="t" state="completed">\n<task_result>\nreply\n</task_result>\n</task>';

  for (const [text, id, state] of [
    [reply, "u", "completed"],
    [reply, undefined, "completed"],
    [reply, "t", "running"],
    [`${reply}\nextra`, "t", "completed"],
    [reply.slice(0, -1), "t", "completed"],
    [` ${reply}`, "t", "completed"],
    ['<task state="failed">\n<task_result>\nx\n</task_result>\n</task>', undefined, "failed"],
    [
      '<task state="completed">\n<summary>a<b</summary>\n<task_result>\nx\n</task_result>\n</task>',
      undefined,
      "completed"
    ],
    ['<task state="completed">\n<task_result>\n</task_result>\n</task>', undefined, "completed"]
  ] as const)
    expect(parseTaskEnvelope(text, { id, state })).toBeUndefined();
});
