import type { UserMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { TitleError } from "./generate.ts";
import { SessionTitle, type TitleHost } from "./runtime.ts";

const opening: UserMessage = { role: "user", content: "Opening request", timestamp: 0 };

function fixture(name?: string, message = opening) {
  const session = SessionManager.inMemory();
  session.appendMessage(message);
  if (name) session.appendSessionInfo(name);
  const generate = vi.fn<TitleHost["generate"]>().mockResolvedValue("Generated title");
  const notify = vi.fn<TitleHost["notify"]>();
  const title = new SessionTitle({
    getSessionName: () => session.getSessionName(),
    setSessionName: (value) => session.appendSessionInfo(value),
    getBranch: () => session.getBranch(),
    generate,
    notify
  });

  return { title, session, generate, notify };
}

it("automatically names once from the opening request and stays quiet", async () => {
  const { title, session, generate, notify } = fixture();
  await title.automatic({ ...opening, content: "Later request" });
  await title.automatic(opening);
  expect(generate).toHaveBeenCalledExactlyOnceWith("Opening request", expect.any(AbortSignal));
  expect(session.getSessionName()).toBe("Generated title");
  expect(notify).not.toHaveBeenCalled();
});

it("waits for text without consuming the automatic attempt", async () => {
  const imageOnly: UserMessage = {
    role: "user",
    content: [{ type: "image", data: "fixture", mimeType: "image/png" }],
    timestamp: 0
  };
  const { title, session, generate } = fixture(undefined, imageOnly);
  await title.automatic(imageOnly);
  expect(generate).not.toHaveBeenCalled();
  await title.automatic(opening);
  expect(generate).toHaveBeenCalledExactlyOnceWith("Opening request", expect.any(AbortSignal));
  expect(session.getSessionName()).toBe("Generated title");
});

it("preserves existing names and allows explicit regeneration", async () => {
  const { title, session, generate, notify } = fixture("Manual title");
  await title.automatic(opening);
  expect(generate).not.toHaveBeenCalled();
  await title.command("");
  expect(generate).toHaveBeenCalledOnce();
  expect(session.getSessionName()).toBe("Generated title");
  expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("Generated title"), "info");
});

it("does not retry automatic failure; manual failure preserves the name and hides raw errors", async () => {
  const { title, session, generate, notify } = fixture();
  const secret = "private provider response";
  generate.mockRejectedValue(new Error(secret));
  await title.automatic(opening);
  await title.automatic(opening);
  expect(generate).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
  session.appendSessionInfo("Keep this title");
  await title.command("");
  expect(session.getSessionName()).toBe("Keep this title");
  expect(notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  for (const [message] of notify.mock.calls) expect(message).not.toContain(secret);
  generate.mockRejectedValue(new TitleError("Configure the title model."));
  await title.command("");
  expect(notify).toHaveBeenLastCalledWith("Configure the title model.", "warning");
});

it("clears without configuration, cancels pending work, and suppresses automatic naming", async () => {
  const { title, session, generate, notify } = fixture();
  const pending = Promise.withResolvers<string>();
  generate.mockReturnValue(pending.promise);
  const automatic = title.automatic(opening);
  const signal = generate.mock.calls[0]?.[1];
  await title.command("clear");
  expect(signal?.aborted).toBe(true);
  pending.resolve("Late title");
  await automatic;
  await title.automatic(opening);
  expect(generate).toHaveBeenCalledOnce();
  expect(session.getSessionName()).toBeUndefined();
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.any(String), "info");
});

it("only commits the latest regeneration", async () => {
  const { title, session, generate, notify } = fixture("Old title");
  const first = Promise.withResolvers<string>();
  const second = Promise.withResolvers<string>();
  generate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const old = title.command("");
  const current = title.command("");
  expect(generate.mock.calls[0]?.[1].aborted).toBe(true);
  second.resolve("Current title");
  await current;
  first.resolve("Obsolete title");
  await old;
  expect(session.getSessionName()).toBe("Current title");
  for (const [message] of notify.mock.calls) expect(message).not.toContain("Obsolete title");
});

it.each(["rename", "tree", "shutdown"])(
  "cancels generation on %s without a late name or outcome notification",
  async (action) => {
    const { title, session, generate, notify } = fixture();
    const pending = Promise.withResolvers<string>();
    generate.mockReturnValue(pending.promise);
    const result = title.command("");
    expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
    const progress = notify.mock.calls.slice();
    if (action === "rename") {
      session.appendSessionInfo("External title");
      title.nameChanged();
    } else if (action === "tree") title.cancel();
    else title.dispose();
    expect(generate.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve("Obsolete title");
    await result;
    await title.automatic(opening);
    expect(generate).toHaveBeenCalledOnce();
    expect(session.getSessionName()).toBe(action === "rename" ? "External title" : undefined);
    expect(notify.mock.calls).toEqual(progress);
  }
);

it("checks the live title before committing even if its change event has not arrived", async () => {
  const { title, session, generate } = fixture("Before");
  const pending = Promise.withResolvers<string>();
  generate.mockReturnValue(pending.promise);
  const result = title.command("");
  session.appendSessionInfo("External title");
  pending.resolve("Obsolete title");
  await result;
  expect(session.getSessionName()).toBe("External title");
});

it("keeps disposed naming callbacks inert", async () => {
  const { title, session, generate, notify } = fixture("Retained title");
  title.dispose();
  await title.command("");
  await title.command("clear");
  await title.automatic(opening);
  expect(generate).not.toHaveBeenCalled();
  expect(session.getSessionName()).toBe("Retained title");
  expect(notify).not.toHaveBeenCalled();
});
