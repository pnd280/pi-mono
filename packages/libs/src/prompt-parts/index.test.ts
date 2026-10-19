import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { coordinationHost, loadOrders, ranks } from "../coordination/test-fixture.ts";
import { joinPromptParts } from "./index.ts";

/** Pi's prompt section for the append text, as the model receives it. */
const addendum = "<addendum>\nBASE-APPEND\n\nPART-B\n\nPART-A\n</addendum>";

it.each(loadOrders)(
  "appends parts after existing text in ascending rank, once per run, after holds when %s loads before %s",
  async (...order) => {
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    let ready = false;
    // Loaded first, so the hold is still pending when the coordinator starts the run.
    const releaser: InlineExtension = {
      name: "releaser",
      factory: (pi) => {
        pi.on("before_agent_start", () => {
          setTimeout(release, 0);
        });
      }
    };
    const { session, requests, errors } = await coordinationHost(
      [
        releaser,
        ...order.map((id): InlineExtension => ({
          name: id,
          factory: (pi) => {
            const parts = joinPromptParts(pi, { id });

            if (id === "b") {
              parts.part(ranks.b, () => "PART-B");
            } else {
              parts.hold(
                released.then(() => {
                  ready = true;
                })
              );
              parts.part(ranks.a, () => (ready ? "PART-A" : "PART-A-BEFORE-HOLD"));
            }
          }
        }))
      ],
      { appendSystemPrompt: "BASE-APPEND" }
    );

    await session.prompt("first");
    await session.prompt("second");

    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request.systemPrompt).toContain(addendum);
    expect(errors).toEqual([]);
  }
);
