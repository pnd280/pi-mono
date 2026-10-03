import { NativeClipboardError } from "@pi-mono/libs/native-clipboard";
import { expect, it, vi } from "vite-plus/test";

import type { ManagerPorts } from "./manager.ts";
import type { MutationResult, Repository } from "./model.ts";
import { collection, entry, managerFixture } from "./test-fixture.ts";

it("keeps capture failure and queue overflow notifications generic", async () => {
  const failure = Promise.withResolvers<MutationResult>();
  const mutate = vi.fn<Repository["mutate"]>(() => failure.promise);
  const fixture = managerFixture({ repository: { read: vi.fn(), mutate } });

  for (let i = 0; i < 251; i++) fixture.manager.capture(`prompt-${i}`);
  expect(fixture.notices).toHaveLength(1);
  await Promise.resolve();
  failure.resolve({ status: "failed", message: "sensitive failure detail" });
  await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(250));
  expect(fixture.notices).toHaveLength(1);
  expect(fixture.notices.join()).not.toContain("sensitive");
  await fixture.manager.dispose();
});

it("reports safe clipboard diagnostics without exposing arbitrary helper errors", async () => {
  for (const error of [
    new NativeClipboardError("Safe native clipboard diagnostic."),
    new Error("sensitive source text")
  ]) {
    const notify = vi.fn<ManagerPorts["notify"]>();
    const fixture = managerFixture({
      copy: async () => {
        throw error;
      },
      notify
    });

    try {
      await fixture.manager.copy(collection([entry("source")]).entries[0]!);
      expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
      if (error instanceof NativeClipboardError)
        expect(notify).toHaveBeenCalledWith(error.message, "error");
      else
        expect(notify.mock.calls.map(([message]) => message).join()).not.toContain(
          "sensitive source text"
        );
    } finally {
      await fixture.manager.dispose();
    }
  }
});

it("reports committed deletion cleanup warnings separately from failures", async () => {
  const snapshot = collection([entry("source")]);
  const notify = vi.fn<ManagerPorts["notify"]>();
  const fixture = managerFixture({
    notify,
    repository: {
      read: async () => snapshot,
      mutate: async () => ({
        status: "committed",
        snapshot: collection(),
        warnings: ["Descriptor cleanup warning.", "Lock cleanup warning."]
      })
    }
  });

  try {
    await fixture.manager.command("drafts delete 1");
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Descriptor cleanup warning."),
      "warning"
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Lock cleanup warning."),
      "warning"
    );
  } finally {
    await fixture.manager.dispose();
  }
});
