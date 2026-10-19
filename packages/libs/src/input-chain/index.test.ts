import { expect, it } from "vite-plus/test";

import { coordinationHost, loadOrders, ranks } from "../coordination/test-fixture.ts";
import { joinInputChain } from "./index.ts";

it.each(loadOrders)(
  "observes typed input, transforms in ascending rank, and stops at handled when %s loads before %s",
  async (...order) => {
    const observed: Record<"a" | "b", string[]> = { a: [], b: [] };
    const { session, requests, errors } = await coordinationHost(
      order.map((id) => ({
        name: id,
        factory: (pi) => {
          const chain = joinInputChain(pi, { id });
          chain.observe((event) => {
            observed[id].push(event.text);
          });
          chain.transform(ranks[id], (event) =>
            id === "b" && event.text === "stop"
              ? { action: "handled" }
              : { action: "transform", text: `${event.text} +${id}` }
          );
        }
      }))
    );

    await session.prompt("hello");
    await session.prompt("stop");

    expect(requests.map((request) => request.userText)).toEqual(["hello +b +a"]);
    expect(observed).toEqual({ a: ["hello", "stop"], b: ["hello", "stop"] });
    expect(errors).toEqual([]);
  }
);
