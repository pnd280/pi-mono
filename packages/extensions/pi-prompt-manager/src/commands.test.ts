import { expect, it, vi } from "vite-plus/test";

import { completions, parseCommand } from "./commands.ts";
import { managerFixture } from "./test-fixture.ts";

it("accepts only canonical positive safe integer indices and literal add text", () => {
  for (const index of ["0", "01", "-1", "+1", "1.0", "1e2", "9007199254740992", "1 trailing", ""])
    expect(parseCommand(`drafts delete ${index}`)).toEqual({ kind: "invalid" });
  expect(parseCommand("drafts restore-and-delete 23")).toEqual({
    kind: "numbered",
    action: "restore-and-delete",
    index: 23
  });
  expect(parseCommand(' drafts add  "hello" \\n $HOME --flag\n  rest  ')).toEqual({
    kind: "add",
    text: '"hello" \\n $HOME --flag\n  rest'
  });
  expect(completions("drafts")).toBeNull();
  expect(completions("drafts ")?.length).toBeGreaterThan(0);
  expect(completions("drafts res")?.map((item) => item.value)).toEqual([
    "drafts restore",
    "drafts restore-and-delete"
  ]);
});

it("rejects bad syntax before reads, mutation, editor access, or clipboard work", async () => {
  const read = vi.fn();
  const mutate = vi.fn();
  const { manager } = managerFixture({ repository: { read, mutate } });

  for (const args of [
    "History",
    "save extra",
    "drafts add",
    "drafts show 01",
    "drafts clear",
    "history extra"
  ])
    await manager.command(args);
  expect(read).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
});
