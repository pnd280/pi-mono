import type { UserMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { SessionTitle, type TitleHost } from "./runtime.ts";

const opening: UserMessage = { role: "user", content: "Opening request", timestamp: 0 };

function fixture(name?: string) {
  const session = SessionManager.inMemory();
  session.appendMessage(opening);
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

it("cancels generation on shutdown without a late name or outcome notification", async () => {
  const { title, session, generate, notify } = fixture();
  const pending = Promise.withResolvers<string>();
  generate.mockReturnValue(pending.promise);
  const result = title.command("");
  expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
  const progress = notify.mock.calls.slice();
  title.dispose();
  expect(generate.mock.calls[0]?.[1].aborted).toBe(true);
  pending.resolve("Obsolete title");
  await result;
  await title.automatic(opening);
  expect(generate).toHaveBeenCalledOnce();
  expect(session.getSessionName()).toBeUndefined();
  expect(notify.mock.calls).toEqual(progress);
});

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
