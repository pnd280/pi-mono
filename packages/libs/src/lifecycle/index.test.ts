import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { coordinationHost, loadOrders, ranks } from "../coordination/test-fixture.ts";
import { joinLifecycle } from "./index.ts";

it.each(loadOrders)(
  "commits once per start after every handler in ascending rank, and revokes before any shutdown await when %s loads before %s",
  async (...order) => {
    const log: string[] = [];
    const late: InlineExtension = {
      name: "late",
      factory: (pi) => {
        pi.on("session_start", () => {
          log.push("start:late");
        });
      }
    };
    const { session, errors, bind } = await coordinationHost([
      ...order.map((id): InlineExtension => ({
        name: id,
        factory: (pi) => {
          const lifecycle = joinLifecycle(pi, { id });
          lifecycle.onSessionStart((_event, _ctx, arrival) => {
            log.push(`start:${id}`);
            arrival.commit(ranks[id], () => {
              log.push(`commit:${id}`);
            });
          });
          lifecycle.onSessionShutdown(
            () => log.push(`revoke:${id}`),
            async () => {
              log.push(`cleanup:${id}`);
              await Promise.resolve();
            }
          );
        }
      })),
      late
    ]);
    await bind();
    const emission = [...order.map((id) => `start:${id}`), "start:late", "commit:b", "commit:a"];
    expect(log.splice(0)).toEqual([...emission, ...emission]);

    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });

    expect(log.slice(0, 2).sort()).toEqual(["revoke:a", "revoke:b"]);
    expect(log.slice(2).sort()).toEqual(["cleanup:a", "cleanup:b"]);
    expect(errors).toEqual([]);
  }
);

it("registers no overlapping shortcut claim, warns once per conflict, and registers the others", async () => {
  const claims = { a: ["ctrl+alt+x", "ctrl+alt+y"], b: ["alt+ctrl+x", "ctrl+alt+u"] };
  const pressed: string[] = [];
  const { session, notify, errors, bind } = await coordinationHost(
    (["a", "b"] as const).map((id) => ({
      name: id,
      factory: (pi) => {
        joinLifecycle(pi, { id }).onSessionStart((_event, _ctx, arrival) => {
          for (const key of claims[id])
            arrival.claimShortcut(key, { handler: () => void pressed.push(`${id}:${key}`) });
        });
      }
    }))
  );

  const registered = Object.fromEntries(
    [...session.extensionRunner.getShortcuts({})].map(([key, shortcut]) => [
      key,
      shortcut.extensionPath
    ])
  );
  expect(registered).toEqual({ "ctrl+alt+u": "<inline:b>", "ctrl+alt+y": "<inline:a>" });
  expect(notify.mock.calls).toEqual([[expect.stringContaining('"ctrl+alt+x"'), "warning"]]);

  // Pi cannot remove a shortcut, so keys that a later bind drops or puts in conflict stay registered.
  claims.b = ["alt+ctrl+x", "ctrl+alt+y"];
  await bind();
  const context = session.extensionRunner.createContext();
  for (const [, shortcut] of session.extensionRunner.getShortcuts({}))
    await shortcut.handler(context);
  expect(pressed).toEqual([]);
  expect(errors).toEqual([]);
});
