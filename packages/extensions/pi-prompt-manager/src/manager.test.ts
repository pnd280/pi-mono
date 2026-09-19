import { NativeClipboardError } from "@pi-mono/libs/native-clipboard";
import { expect, it, vi } from "vite-plus/test";

import type { ManagerPorts } from "./manager.ts";
import type { MutationResult, Repository } from "./model.ts";
import { collection, deferred, entry, managerFixture } from "./test-fixture.ts";

const committed = (): MutationResult => ({
  status: "committed",
  snapshot: collection(),
  warnings: []
});

it("saves exact expanded editor text, rejects overlapping saves, and leaves concurrent edits intact", async () => {
  const pending = deferred<MutationResult>();
  const mutate = vi.fn<Repository["mutate"]>(() => pending.promise);
  const { manager, setText, getText, notices } = managerFixture({
    repository: { read: async () => collection(), mutate }
  });
  setText(" \tfull pasted text\r\n ");
  const save = manager.saveEditor();
  await manager.saveEditor();
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0]?.slice(0, 2)).toMatchObject([
    "drafts",
    { kind: "add", text: " \tfull pasted text\r\n " }
  ]);
  setText("new work");
  pending.resolve(committed());
  await save;
  expect(getText()).toBe("new work");
  expect(notices).toContain("Draft saved.");
});

it("same-text explicit restoration prevents an older save from clearing it", async () => {
  const pending = deferred<MutationResult>();
  const fixture = managerFixture({
    repository: { read: async () => collection(), mutate: () => pending.promise }
  });
  const source = "\tline\r\nnext";
  fixture.setText(source);
  const save = fixture.manager.saveEditor();
  expect(fixture.manager.restore(collection([entry(source)]).entries[0]!)).toBe(true);
  pending.resolve(committed());
  await save;
  expect(fixture.getText()).toBe(source);
});

it("clears only after successful commit and reports clear failure separately from save success", async () => {
  const write = vi.fn(() => {
    throw new Error("clear failed");
  });
  const fixture = managerFixture({ editor: { read: () => "draft", write } });
  await fixture.manager.saveEditor();
  expect(fixture.notices).toEqual([
    "Draft saved.",
    "Draft saved, but the editor could not be cleared."
  ]);
  const failed = managerFixture({
    repository: {
      read: async () => collection(),
      mutate: async () => ({ status: "failed", message: "busy" })
    }
  });
  await failed.manager.saveEditor();
  expect(failed.getText()).toBe("draft");
  const normal = managerFixture();
  await normal.manager.saveEditor();
  expect(normal.getText()).toBe("");
});

it("add is independent of editor saving and whitespace-only editor saves open drafts", async () => {
  const pending = deferred<MutationResult>();
  const mutate = vi
    .fn<Repository["mutate"]>()
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValue(committed());
  const fixture = managerFixture({ repository: { read: async () => collection(), mutate } });
  const save = fixture.manager.saveEditor();
  await fixture.manager.command('drafts add  "literal"  interior  ');
  expect(fixture.getText()).toBe("draft");
  expect(mutate.mock.calls[1]?.slice(0, 2)).toMatchObject([
    "drafts",
    { text: '"literal"  interior' }
  ]);
  pending.resolve(committed());
  await save;
  const open = vi.fn<ManagerPorts["open"]>(async () => {});
  const blank = managerFixture({ open });
  blank.setText("\n \t");
  await blank.manager.saveEditor();
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ collection: "drafts" }));
});

it("restoration refuses controls or an editor change and never deletes on refusal", async () => {
  const mutate = vi.fn<Repository["mutate"]>();
  const fixture = managerFixture({ repository: { read: async () => collection(), mutate } });
  expect(
    await fixture.manager.restoreAndDelete(
      collection([entry("unsafe\x1b]52;c;text\x07")]).entries[0]!
    )
  ).toBe(false);
  expect(fixture.getText()).toBe("draft");
  expect(mutate).not.toHaveBeenCalled();
  const write = vi.fn();
  const read = vi.fn().mockReturnValueOnce("first").mockReturnValue("changed");
  const changed = managerFixture({ editor: { read, write } });
  expect(changed.manager.restore(collection([entry("source")]).entries[0]!)).toBe(false);
  expect(write).not.toHaveBeenCalled();
});

it("restore-then-delete failure retains snapshot source and reports deletion failure without rollback", async () => {
  const current = collection([entry("selected")]);
  const mutate = vi.fn<Repository["mutate"]>(async (): Promise<MutationResult> => ({
    status: "failed",
    message: "target changed"
  }));
  const fixture = managerFixture({ repository: { read: async () => current, mutate } });
  await fixture.manager.command("drafts restore-and-delete 1");
  expect(fixture.getText()).toBe("selected");
  expect(mutate.mock.calls[0]?.slice(0, 2)).toMatchObject([
    "drafts",
    { kind: "delete", target: current.entries[0] }
  ]);
  expect(fixture.notices).toContain(
    "Text was restored; deletion failed. The editor was not rolled back."
  );
});

it.each(["restore", "restore-delete", "cancel", "expired", "unsafe"] as const)(
  "applies a browser's %s request only after closure and keeps stale callbacks inert",
  async (action) => {
    const closed = deferred<void>();
    const removal = deferred<MutationResult>();
    const mutate = vi.fn<Repository["mutate"]>(() => removal.promise);
    const target = collection([entry(action === "unsafe" ? "unsafe\x1b[2J" : "selected")])
      .entries[0]!;
    const open = vi.fn<ManagerPorts["open"]>(async (request) => {
      await closed.promise;
      await request.afterClose(
        action === "cancel"
          ? undefined
          : { target, deleteAfterRestore: action === "restore-delete" || action === "unsafe" }
      );
    });
    const fixture = managerFixture({
      open,
      repository: { read: async () => collection(), mutate }
    });
    const opening = fixture.manager.open("drafts");
    expect(fixture.getText()).toBe("draft");
    expect(mutate).not.toHaveBeenCalled();
    if (action === "expired") await fixture.manager.dispose();
    closed.resolve();

    if (action === "restore-delete") {
      await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(fixture.getText()).toBe("selected");
      expect(mutate.mock.calls[0]?.slice(0, 2)).toEqual(["drafts", { kind: "delete", target }]);
    }

    removal.resolve(committed());
    await opening;
    expect(fixture.getText()).toBe(
      action === "restore" || action === "restore-delete" ? "selected" : "draft"
    );
    if (action !== "restore-delete") expect(mutate).not.toHaveBeenCalled();
    fixture.setText("new work");
    await open.mock.calls[0]![0].afterClose({ target, deleteAfterRestore: true });
    expect(fixture.getText()).toBe("new work");
    expect(mutate).toHaveBeenCalledTimes(action === "restore-delete" ? 1 : 0);
    await fixture.manager.dispose();
  }
);

it("capture is synchronous, FIFO, bounded by count, and shares one generic warning budget", async () => {
  const failure = deferred<MutationResult>();
  const mutate = vi.fn<Repository["mutate"]>(() => failure.promise);
  const fixture = managerFixture({ repository: { read: vi.fn(), mutate } });

  for (let i = 0; i < 251; i++) fixture.manager.capture(`prompt-${i}`);
  expect(mutate).not.toHaveBeenCalled();
  expect(fixture.notices).toHaveLength(1);
  await Promise.resolve();
  expect(mutate).toHaveBeenCalledTimes(1);
  failure.resolve({ status: "failed", message: "sensitive failure detail" });
  await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(250));
  expect(mutate.mock.calls.map((call) => call[1])).toMatchObject(
    Array.from({ length: 250 }, (_, index) => ({ text: `prompt-${index}` }))
  );
  expect(fixture.notices).toHaveLength(1);
  expect(fixture.notices.join()).not.toContain("sensitive");
  await fixture.manager.dispose();
});

it("bounds waiting bytes, silently ignores blank/oversized captures, and does not retry", async () => {
  const mutate = vi.fn<Repository["mutate"]>(async (): Promise<MutationResult> => ({
    status: "failed",
    message: "failure"
  }));
  const fixture = managerFixture({ repository: { read: vi.fn(), mutate } });
  fixture.manager.capture(" ");
  fixture.manager.capture("é".repeat(32769));
  expect(fixture.notices).toEqual([]);

  for (let i = 0; i < 129; i++) fixture.manager.capture(String(i).padEnd(65536, "x"));
  await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(128));
  expect(fixture.notices).toHaveLength(1);
  await fixture.manager.dispose();
});

it("reports shared clipboard diagnostics without exposing arbitrary helper errors", async () => {
  for (const [error, message] of [
    [
      new NativeClipboardError("Safe native clipboard diagnostic."),
      "Safe native clipboard diagnostic."
    ],
    [new Error("sensitive source text"), "Clipboard operation failed or was cancelled."]
  ] as const) {
    const fixture = managerFixture({
      copy: async () => {
        throw error;
      }
    });

    try {
      await fixture.manager.copy(collection([entry("source")]).entries[0]!);
      expect(fixture.notices).toEqual([message]);
    } finally {
      await fixture.manager.dispose();
    }
  }
});

it("notifies copy and deletion results with severity and combined cleanup warnings", async () => {
  const copying = deferred<void>();
  const snapshot = collection([entry("source")]);
  const notify = vi.fn();
  const fixture = managerFixture({
    notify,
    copy: () => copying.promise,
    repository: {
      read: async () => snapshot,
      mutate: async () => ({
        status: "committed",
        snapshot: collection(),
        warnings: ["Descriptor cleanup warning.", "Lock cleanup warning."]
      })
    }
  });
  const target = snapshot.entries[0]!;

  try {
    const pending = fixture.manager.copy(target);
    await fixture.manager.copy(target);
    expect(notify).toHaveBeenLastCalledWith("A clipboard operation is already pending.", "warning");
    copying.resolve();
    await pending;
    expect(notify).toHaveBeenLastCalledWith("Copied to the native clipboard.", "info");
    notify.mockClear();
    await fixture.manager.deleteOccurrence("drafts", target);
    const deletionFeedback = "Entry deleted. Descriptor cleanup warning. Lock cleanup warning.";
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(deletionFeedback, "warning");

    notify.mockClear();
    await fixture.manager.command("drafts copy 1");
    await fixture.manager.command("drafts delete 1");
    expect(notify.mock.calls).toEqual([
      ["Copied to the native clipboard.", "info"],
      [deletionFeedback, "warning"]
    ]);
    await fixture.manager.dispose();
    notify.mockClear();
    await fixture.manager.copy(target);
    expect(notify).not.toHaveBeenCalled();
  } finally {
    await fixture.manager.dispose();
  }
});

it("expires late editor/clipboard/UI callbacks and reserves a UI while it is loading", async () => {
  const saving = deferred<MutationResult>();
  const copying = deferred<void>();
  const opening = deferred<void>();
  const open = vi.fn<ManagerPorts["open"]>(() => opening.promise);
  const copy = vi.fn<ManagerPorts["copy"]>(() => copying.promise);
  const fixture = managerFixture({
    open,
    copy,
    repository: { read: async () => collection(), mutate: () => saving.promise }
  });
  const save = fixture.manager.saveEditor();
  const copyingNow = fixture.manager.copy(collection([entry("copy")]).entries[0]!);
  await fixture.manager.copy(collection([entry("overlap")]).entries[0]!);
  const browser = fixture.manager.open("history");
  await fixture.manager.open("drafts");
  expect(open).toHaveBeenCalledTimes(1);
  expect(copy).toHaveBeenCalledTimes(1);
  await fixture.manager.dispose();
  const before = fixture.notices.length;
  saving.resolve(committed());
  copying.resolve();
  opening.resolve();
  await Promise.all([save, copyingNow, browser]);
  expect(fixture.getText()).toBe("draft");
  expect(fixture.notices).toHaveLength(before);
  expect(open.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(copy.mock.calls[0]?.[1].aborted).toBe(true);
  fixture.manager.capture("stale");
  await fixture.manager.command("save");
  expect(fixture.notices).toHaveLength(before);
});
