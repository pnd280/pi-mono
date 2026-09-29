import { homedir } from "node:os";
import { resolve } from "node:path";

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { piFffAdapter } from "../adapters/@ff-labs/pi-fff/index.ts";
import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { nativeAdapter, genericAdapter } from "../adapters/index.ts";
import { isLive, type DisplayCall, type ExplorationItem } from "../contracts.ts";
import { TranscriptCoordinator } from "./coordinator.ts";

const result = (text = "retained") => ({
  content: [{ type: "text" as const, text }],
  details: undefined
});

function rowHandle() {
  return { invalidate: vi.fn(), requestRender: vi.fn(), setExpanded: vi.fn() };
}

function fixture() {
  const stop = vi.fn();

  let tick = () => {};

  const start = vi.fn((callback: () => void) => {
    tick = callback;

    return stop;
  });
  const onExpansion = vi.fn<(call: DisplayCall) => void>();
  const coordinator = new TranscriptCoordinator("runtime", {
    animationClock: { start },
    onExpansion
  });
  let position = 0;
  const add = (name: string, path: string, origin: "live" | "historical" = "live") =>
    coordinator.add(
      { messageTimestamp: 1, contentIndex: position++, toolCallId: `call-${position}` },
      name,
      { path },
      nativeAdapter(name) ?? genericAdapter,
      origin
    );

  return { coordinator, add, start, stop, onExpansion, tick: () => tick() };
}

it.each(["live"] as const)(
  "forms contiguous scope runs for %s calls without merging a return to an earlier scope",
  (origin) => {
    const cwd = resolve("/workspace/project");
    const c = new TranscriptCoordinator("scopes", { cwd });
    let index = 0;
    const add = (name: string, args: unknown) =>
      c.add(
        { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
        name,
        args,
        nativeAdapter(name)!,
        origin
      );

    try {
      const first = add("ls", { path: "src/rendering/" });
      const second = add("grep", { pattern: "heading", path: "./src/rendering/../rendering" });
      const third = add("read", {
        path: resolve(cwd, "src/rendering/headings.ts"),
        offset: 1,
        limit: 80
      });
      const repeated = add("read", { path: "src/rendering/headings.ts", offset: 81 });
      const other = add("read", { path: "src/transcript/coordinator.ts" });
      const returned = add("read", { path: "src/rendering/cards.ts" });
      const sibling = add("read", { path: "src/rendering/results.ts" });
      expect(c.group(first)?.members).toEqual([first, second, third, repeated]);
      expect(c.group(other)).toBeUndefined();
      expect(c.group(returned)?.members).toEqual([returned, sibling]);
      c.expand(first, true);
      expect([...c.calls.values()].map((call) => call.expanded)).toEqual([
        true,
        true,
        true,
        true,
        false,
        false,
        false
      ]);
      c.setBoundary({}, second);
      expect(c.group(first)?.members).toEqual([first, second]);
      expect(c.group(third)?.members).toEqual([third, repeated]);
    } finally {
      c.dispose();
    }
  }
);

it("normalizes home and native path spellings without interpreting literal filters as directories", () => {
  const c = new TranscriptCoordinator("literal-scopes");
  let index = 0;
  const add = (name: string, args: unknown) =>
    c.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      name,
      args,
      nativeAdapter(name) ?? piFffAdapter(fffToolInfo(name))!,
      "historical"
    );

  try {
    const home = add("read", { path: "@~/project/a.ts" });
    const absolute = add("read", { path: resolve(homedir(), "project/b.ts") });
    expect(c.group(home)?.members).toEqual([home, absolute]);
    const search = add("ffgrep", { pattern: "one", path: "src/**" });
    const listing = add("fffind", { pattern: "", path: "src/**" });
    expect(c.group(search)?.members).toEqual([search, listing]);
    c.add(
      listing.reference,
      listing.name,
      { pattern: "files", path: "src/**" },
      listing.adapter,
      "historical"
    );
    expect(c.group(search)?.members).toEqual([search, listing]);
    const distinct = add("fffind", { pattern: "two", path: "./src/**" });
    expect(c.group(distinct)).toBeUndefined();
    const literal = add("ffgrep", { pattern: "three", path: "src/" });
    const directory = add("ls", { path: "src/" });
    expect(c.group(literal)).toBeUndefined();
    expect(c.group(directory)).toBeUndefined();
  } finally {
    c.dispose();
  }
});

it("keeps titled groups separate from exploration groups with the same literal filter", () => {
  const c = new TranscriptCoordinator("group-titles");
  let index = 0;
  const add = (id: string, title?: string) =>
    c.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      id,
      {},
      {
        id,
        family: "invocation",
        ...(title === undefined ? {} : { groupTitle: title }),
        exploration: () => [
          {
            parts: [{ kind: "value", text: id }],
            scope: { kind: "filter", value: "shared" }
          }
        ]
      },
      "historical"
    );

  try {
    const titled = add("tasks", "Tasks");
    const firstSearch = add("search:first");
    const secondSearch = add("search:second");
    expect(c.group(titled)).toBeUndefined();
    expect(c.group(firstSearch)?.members).toEqual([firstSearch, secondSearch]);
  } finally {
    c.dispose();
  }
});

it("repartitions changed streamed scopes without duplicating members or expanding across other runs", () => {
  const { coordinator: c, add } = fixture();

  try {
    const first = add("read", "a/first.ts");
    const middle = add("read", "a/middle.ts");
    const last = add("read", "b/last.ts");
    const stable = add("read", "c/stable.ts");
    const stableSibling = add("read", "c/sibling.ts");
    const stableGroup = c.group(stable);
    const row = rowHandle();
    c.attach(stable, row);
    c.expand(last, true);
    c.add(middle.reference, "read", { path: "b/middle.ts" }, middle.adapter, "live");
    expect(c.group(first)).toBeUndefined();
    expect(c.group(middle)?.members).toEqual([middle, last]);
    expect([middle.expanded, last.expanded]).toEqual([false, false]);
    c.add(last.reference, "read", { path: "a/last.ts" }, last.adapter, "live");
    expect(c.group(last)).toBeUndefined();
    c.add(last.reference, "read", { path: "b/last.ts" }, last.adapter, "live");
    expect(c.group(last)?.members).toEqual([middle, last]);
    expect(c.group(stable)).toBe(stableGroup);
    expect(c.group(stable)?.members).toEqual([stable, stableSibling]);
    expect(row.invalidate).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("requires explicit matching scopes for every item without duplicating members", () => {
  const c = new TranscriptCoordinator("structured-scopes");
  const item: ExplorationItem = { parts: [{ kind: "path", text: "src/a.ts" }] };
  const scoped: ExplorationItem = { ...item, scope: { kind: "file", value: "src/a.ts" } };
  let index = 0;
  const add = (items: ExplorationItem[]) =>
    c.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      "custom",
      {},
      { id: "custom:read", family: "read", exploration: () => items },
      "historical"
    );

  try {
    const first = add([scoped]);
    const missing = add([item]);
    const mixed = add([scoped, { ...scoped, scope: { kind: "file", value: "other/a.ts" } }]);
    const multiple = add([scoped, { ...scoped, scope: { kind: "file", value: "src/b.ts" } }]);
    const last = add([scoped]);
    for (const call of [first, missing, mixed]) expect(c.group(call)).toBeUndefined();
    expect(c.group(multiple)?.members).toEqual([multiple, last]);
  } finally {
    c.dispose();
  }
});

it("owns supplemental state and removes saved previews when their path is evicted", () => {
  const { coordinator: c, add } = fixture();

  try {
    const first = add("read", "a.ts", "historical");
    const second = add("read", "b.ts", "historical");
    c.setReferenceEntry(second, "retained-entry");
    expect(second.reference.messageEntryId).toBe("retained-entry");
    expect(first.reference.messageEntryId).toBeUndefined();

    const output = { path: "/saved-output", text: "retained preview" };
    for (const call of [first, second]) c.setSavedOutput(call, output);
    output.text = "changed by caller";
    expect(first.savedOutput?.text).toBe("retained preview");
    expect(second.savedOutput?.text).toBe("retained preview");
    c.evictSavedOutput("/unrelated");
    expect(first.savedOutput?.text).toBe("retained preview");
    expect(second.savedOutput?.text).toBe("retained preview");
    c.evictSavedOutput(output.path);
    expect(first.savedOutput).toBeUndefined();
    expect(second.savedOutput).toBeUndefined();
  } finally {
    c.dispose();
  }
});

it("rejects foreign and disposed call updates without changing retained views or notifying rows", () => {
  const { coordinator: c } = fixture();
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "owned" };
  const call = c.add(reference, "bash", {}, nativeAdapter("bash")!, "live");
  const row = rowHandle();
  c.attach(call, row);
  reference.toolCallId = "changed by caller";
  expect(call.reference.toolCallId).toBe("owned");
  const retained = { ...call };

  const update = (view: typeof call) => {
    c.setReferenceEntry(view, "late-entry");
    c.setSavedPath(view, "/late");
    c.setSavedOutput(view, { path: "/late", text: "late preview" });
    c.fact(view, { kind: "change", availability: "unavailable", reason: "late fact" });
    c.result(view, result("late result"), "failure");
    c.expand(view, true);
  };

  try {
    update(retained);
    expect(call).toEqual(retained);
    c.dispose();
    update(call);
    expect(call).toEqual(retained);
    expect(c.calls.size).toBe(0);
    expect(row.invalidate).not.toHaveBeenCalled();
    expect(row.setExpanded).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("moves a visible boundary without spreading expansion through a temporary merge", () => {
  const { coordinator: c, add } = fixture();

  try {
    const first = add("read", "first.ts", "historical");
    const second = add("read", "second.ts", "historical");
    const third = add("read", "third.ts", "historical");
    const owner = {};
    c.setBoundary(owner, first);
    c.expand(first, true);
    c.setBoundary(owner, second);
    expect(c.group(first)?.members).toEqual([first, second]);
    expect(c.group(third)).toBeUndefined();
    expect([first.expanded, second.expanded, third.expanded]).toEqual([true, true, false]);

    // Losing and regaining membership in the middle reconciles both neighbors.
    c.setBoundary(owner);
    c.add(second.reference, "read", {}, second.adapter, "historical");
    expect(c.group(first)).toBeUndefined();
    expect(c.group(second)).toBeUndefined();
    expect(c.group(third)).toBeUndefined();
    c.add(second.reference, "read", { path: "second.ts" }, second.adapter, "historical");
    expect(c.group(second)?.members).toEqual([first, second, third]);
  } finally {
    c.dispose();
  }
});

it("keeps group membership current without re-evaluating distant completed calls", () => {
  const c = new TranscriptCoordinator("local-groups");
  const native = nativeAdapter("read")!;
  const exploration = vi.fn((...args: Parameters<NonNullable<typeof native.exploration>>) =>
    native.exploration!(...args)
  );
  const adapter = { ...native, exploration };

  try {
    const old = Array.from({ length: 1000 }, (_, index) => {
      const call = c.add(
        { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
        "read",
        { path: `${index}.ts` },
        adapter,
        "historical"
      );
      if (index % 2 === 1) c.boundary();

      return call;
    });
    expect(c.group(old[0]!)?.members).toEqual([old[0], old[1]]);
    const reference = { messageTimestamp: 1001, contentIndex: 0, toolCallId: "new" };
    const call = c.add(reference, "read", {}, adapter, "historical");
    exploration.mockClear();
    c.add(reference, "read", { path: "new.ts" }, adapter, "historical");
    expect(exploration.mock.calls.length).toBeLessThan(5);
    expect(c.group(call)).toBeUndefined();
    expect(c.group(old[0]!)?.members).toEqual([old[0], old[1]]);
    exploration.mockClear();
    const owner = {};
    c.setBoundary(owner, old[500]);
    expect(c.group(old[500]!)).toBeUndefined();
    c.setBoundary(owner);
    expect(c.group(old[500]!)?.members).toEqual([old[500], old[501]]);
    expect(exploration.mock.calls.length).toBeLessThan(5);
    expect(c.group(old[0]!)?.members).toEqual([old[0], old[1]]);
  } finally {
    c.dispose();
  }
});

it("bounds adapter work when reconstructing nested batches and boundaries", () => {
  const { coordinator: c, onExpansion } = fixture();
  const exploration = vi.fn(() => [
    {
      scope: { kind: "file" as const, value: "file.txt" },
      parts: [{ kind: "path" as const, text: "file.txt" }]
    }
  ]);
  const adapter = { id: "owner:read", family: "read" as const, exploration };
  const calls = Array.from({ length: 100 }, (_, index) =>
    c.add(
      { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
      "read",
      {},
      genericAdapter,
      "historical",
      index % 2 === 0
    )
  );

  try {
    c.batch(() => {
      for (const call of calls) c.setAdapter(call, adapter);
      c.batch(() => {
        for (const call of calls.slice(0, -1)) c.setBoundary({}, call);
      });
    });
    expect(exploration.mock.calls.length).toBeLessThan(calls.length * 2);
    for (const call of calls) expect(c.group(call)).toBeUndefined();
    expect(calls.map((call) => call.expanded)).toEqual(calls.map((_, index) => index % 2 === 0));
    expect(onExpansion).not.toHaveBeenCalled();

    exploration.mockClear();
    expect(() =>
      c.batch(() => {
        c.boundary(calls[0]);
        throw new Error("reconstruction failed");
      })
    ).toThrow("reconstruction failed");
    expect(exploration.mock.calls.length).toBeLessThan(5);
    expect(c.group(calls[0]!)).toBeUndefined();
  } finally {
    c.dispose();
  }
});

it("regroups late historical contracts without changing results, source order, or live activity", () => {
  const { coordinator: c, start, onExpansion } = fixture();

  try {
    const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" };
    const first = c.add(reference, "fffind", { pattern: "a" }, genericAdapter, "historical");
    const second = c.add(
      { ...reference, contentIndex: 1, toolCallId: "second" },
      "fffind",
      { pattern: "b" },
      genericAdapter,
      "historical"
    );
    const retained = result("retained results");
    c.result(first, retained, "success");
    c.result(second, retained, "failure");
    const row = rowHandle();
    c.attach(first, row);
    c.expand(first, true);
    onExpansion.mockClear();
    const adapter = {
      id: "@ff-labs/pi-fff:find",
      family: "search" as const,
      exploration: () => [
        {
          scope: { kind: "filter" as const, value: "." },
          parts: [{ kind: "value" as const, text: "supplied pattern" }]
        }
      ]
    };
    c.setAdapter(first, adapter);
    c.setAdapter(second, adapter);
    expect(c.group(first)?.members).toEqual([first, second]);
    expect(second.expanded).toBe(true);
    expect(onExpansion).toHaveBeenCalledExactlyOnceWith(second);
    expect(first.result).toBe(retained);
    expect(second.outcome).toBe("failure");
    expect(first.origin).toBe("historical");
    expect(first.lifecycle).toBe("complete");
    expect(row.invalidate).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("restores exploration groups when final results establish a previously unavailable contract", () => {
  const { coordinator: c, start } = fixture();

  try {
    const adapter = {
      id: "owner:search",
      family: "search" as const,
      exploration: (_args: unknown, value?: AgentToolResult<unknown>) =>
        value?.content[0]?.type === "text" && value.content[0].text === "search results"
          ? [
              {
                scope: { kind: "directory" as const, value: "." },
                parts: [{ kind: "value" as const, text: "needle" }]
              }
            ]
          : undefined
    };
    const calls = [0, 1].map((index) =>
      c.add(
        { messageTimestamp: 1, contentIndex: index, toolCallId: `search-${index}` },
        "search",
        { pattern: "needle" },
        adapter,
        "historical"
      )
    );
    expect(c.group(calls[0]!)).toBeUndefined();
    for (const call of calls) c.result(call, result("search results"), "success");
    expect(c.group(calls[0]!)?.members).toEqual(calls);
    c.result(calls[1]!, result("unsupported result"), "failure");
    expect(c.group(calls[0]!)).toBeUndefined();
    c.result(calls[1]!, result("search results"), "success");
    expect(c.group(calls[0]!)?.members).toEqual(calls);
    expect(start).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("retains every ordered call and failure while expanding the group together", () => {
  const { coordinator: c, add } = fixture();
  const first = add("read", "/src/a.ts");
  c.result(first, result(), "success");
  const second = add("read", "/src/b.ts");
  const third = add("read", "/src/a.ts");
  c.result(third, result("third"), "success");
  c.result(second, result("denied"), "failure");
  const group = c.group(first)!;
  expect(group.members).toEqual([first, second, third]);
  expect(group.members.map((call) => call.outcome)).toEqual(["success", "failure", "success"]);
  const rows = group.members.map((call) => {
    const row = rowHandle();
    c.attach(call, row);

    return row;
  });
  c.expand(second, true);
  expect(group.members.every((call) => call.expanded)).toBe(true);
  for (const row of rows) expect(row.setExpanded).toHaveBeenCalledWith(true);
  c.expand(first, false);
  expect(group.members).toEqual([first, second, third]);
  c.boundary();
  const next = add("read", "c.ts");
  expect(c.group(next)).not.toBe(group);
  add("custom.read", "unknown");
  const afterCustom = add("read", "d.ts");
  expect(c.group(afterCustom)).toBeUndefined();
  c.dispose();
});
it("withdraws only the owning component's boundary and preserves other separators", () => {
  const { coordinator: c, add, start } = fixture();

  try {
    const calls = ["a", "b", "c"].map((path) => add("read", path, "historical"));
    const [first, second] = calls;
    const assistant = {},
      entry = {};
    c.setBoundary(assistant, first);
    c.setBoundary(entry, first);
    c.setBoundary(assistant);
    expect(c.group(first!)).toBeUndefined();
    expect(c.group(second!)?.members).toEqual(calls.slice(1));
    c.setBoundary(entry);
    expect(c.group(first!)?.members).toEqual(calls);
    c.setBoundary(assistant, second);
    expect(c.group(first!)?.members).toEqual(calls.slice(0, 2));
    c.boundary(second);
    c.setBoundary(assistant);
    expect(c.group(first!)?.members).toEqual(calls.slice(0, 2));
    c.setBoundary(assistant, first);
    c.setBoundary(assistant, second);
    expect(c.group(first!)?.members).toEqual(calls.slice(0, 2));
    c.expand(first!, true);
    expect(calls.map((call) => call.expanded)).toEqual([true, true, false]);
    expect(start).not.toHaveBeenCalled();
    c.dispose();
    c.setBoundary(assistant, first);
    expect(c.calls.size).toBe(0);
  } finally {
    c.dispose();
  }
});

it("applies global expansion once per group while keeping independent groups synchronized", () => {
  const { coordinator: c, add, onExpansion } = fixture();

  try {
    const first = add("read", "a.ts", "historical");
    const sibling = add("read", "b.ts", "historical");
    c.boundary();
    const separate = add("read", "c.ts", "historical");
    const calls = [first, sibling, separate];
    const rows = calls.map((call) => {
      const row = rowHandle();
      c.attach(call, row);

      return row;
    });

    // Pi's global action visits every row, including siblings of an expanded group.
    for (const expanded of [true, false]) {
      for (const call of calls) c.expand(call, expanded);

      for (const row of rows) {
        expect(row.setExpanded).toHaveBeenCalledExactlyOnceWith(expanded);
        row.setExpanded.mockClear();
      }

      expect(calls.every((call) => call.expanded === expanded)).toBe(true);
      expect(onExpansion.mock.calls.map(([call]) => call)).toEqual(calls);
      onExpansion.mockClear();
    }
  } finally {
    c.dispose();
  }
});
it("runs one scheduler only for known live activity, rejects late previews, and disposes row subscriptions", () => {
  const { coordinator: c, add, start, stop, tick } = fixture();
  const historical = add("read", "old", "historical");
  expect(isLive(historical)).toBe(false);
  expect(start).not.toHaveBeenCalled();
  const first = add("bash", "a"),
    second = add("bash", "b");
  expect(start).toHaveBeenCalledTimes(1);
  const row = rowHandle();
  c.attach(first, row);
  tick();
  expect(row.requestRender).toHaveBeenCalledOnce();
  expect(row.invalidate).not.toHaveBeenCalled();
  c.preview(first, { text: "real chunks" });
  c.result(first, result("authoritative"), "success");
  c.preview(first, { text: "late" });
  c.update(first, "executing");
  c.result(first, result("late snapshot"), "success", true);
  expect(first.result).toEqual(result("authoritative"));
  expect(first.liveOutput).toBeUndefined();
  expect(stop).not.toHaveBeenCalled();
  c.settle();
  expect(second.lifecycle).toBe("unavailable");
  expect(second.outcome).toBe("unavailable");
  expect(stop).toHaveBeenCalledTimes(1);
  c.dispose();
  c.dispose();
  expect(stop).toHaveBeenCalledTimes(1);
});
it("retains a live call's row and outcome when finalized content moves its source position", () => {
  const { coordinator: c, start, stop } = fixture();

  try {
    const reference = { messageTimestamp: 1, contentIndex: 1, toolCallId: "moved" };
    const first = c.add(reference, "read", { path: "first.ts" }, nativeAdapter("read")!, "live");
    const row = rowHandle();
    c.attach(first, row);
    c.expand(first, true);
    const finalized = { ...reference, contentIndex: 0 };
    const same = c.add(finalized, "read", { path: "final.ts" }, nativeAdapter("read")!, "live");
    expect(same).toBe(first);
    expect(first.reference).toEqual(finalized);
    expect(first.args).toEqual({ path: "final.ts" });
    expect(first.expanded).toBe(true);
    expect(c.calls.size).toBe(1);
    expect(c.group(first)).toBeUndefined();
    row.invalidate.mockClear();
    c.result(c.byId("moved")!, result("only this call failed"), "failure");
    expect(row.invalidate).toHaveBeenCalled();
    c.settle();
    expect(first.lifecycle).toBe("complete");
    expect(first.outcome).toBe("failure");
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    const next = c.add(
      { ...finalized, messageTimestamp: 2 },
      "read",
      {},
      nativeAdapter("read")!,
      "live"
    );
    expect(next).not.toBe(first);
    expect(c.calls.size).toBe(2);
  } finally {
    c.dispose();
  }
});

it("keeps historical missing results still and separates identical call IDs by source position", () => {
  const { coordinator: c, start } = fixture();
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "duplicate" };
  const first = c.add(reference, "read", {}, nativeAdapter("read")!, "historical");
  c.add(reference, "read", { path: "prepared.ts" }, nativeAdapter("read")!, "historical");
  expect(c.group(first)).toBeUndefined();
  const second = c.add(
    { ...reference, contentIndex: 1 },
    "read",
    { path: "other.ts" },
    nativeAdapter("read")!,
    "historical"
  );
  expect(first.key).not.toBe(second.key);
  expect(c.calls.size).toBe(2);
  expect(start).not.toHaveBeenCalled();
  expect(c.byId("orphan")).toBeUndefined();
  c.dispose();
});

function summaryFixture(mode: "summary" | "compact" = "summary") {
  const coordinator = new TranscriptCoordinator("runs", {
    mode,
    animationClock: { start: () => () => {} }
  });
  let index = 0;
  const handles = new Map<string, ReturnType<typeof rowHandle>>();

  const add = (name: string, args: unknown, origin: "live" | "historical" = "historical") => {
    const call = coordinator.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      name,
      args,
      nativeAdapter(name) ?? genericAdapter,
      origin
    );
    const handle = rowHandle();
    coordinator.attach(call, handle);
    handles.set(call.key, handle);

    return call;
  };

  const invalidations = (call: DisplayCall) => handles.get(call.key)?.invalidate.mock.calls.length;
  const clear = () => handles.forEach((handle) => handle.invalidate.mockClear());
  const roles = () =>
    [...coordinator.calls.values()].map((call) => coordinator.summaryRole(call)?.kind ?? "card");

  return { coordinator, add, invalidations, clear, roles };
}

it("partitions runs only at visible boundaries, including groups and other tools", () => {
  const { coordinator, add, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" });
    const second = add("read", { path: "b.ts" });
    const shell = add("bash", { command: "true" });
    const custom = add("custom", {});
    expect(coordinator.run(first)?.members).toEqual([first, second, shell, custom]);
    expect(coordinator.group(first)?.members).toEqual([first, second]);
    expect(roles()).toEqual(["leader", "hidden", "hidden", "hidden"]);

    // Visible assistant text splits runs; final middleware can withdraw it again.
    const owner = {};
    coordinator.setBoundary(owner, second);
    expect(coordinator.run(first)?.members).toEqual([first, second]);
    expect(coordinator.run(shell)?.members).toEqual([shell, custom]);
    expect(roles()).toEqual(["leader", "hidden", "leader", "hidden"]);
    coordinator.setBoundary(owner, undefined);
    expect(coordinator.run(custom)?.members).toEqual([first, second, shell, custom]);

    // Unowned tools and notices separate the next call from the current run.
    coordinator.boundary();
    const next = add("read", { path: "c.ts" });
    expect(coordinator.run(next)?.members).toEqual([next]);
    coordinator.boundary(first);
    expect(coordinator.run(first)?.members).toEqual([first]);
    expect(coordinator.run(second)?.members).toEqual([second, shell, custom]);
  } finally {
    coordinator.dispose();
  }
});

it("preserves an opened later run when assistant boundaries withdraw", () => {
  const { coordinator, add, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" }, "live");
    coordinator.result(first, result(), "success");
    const owner = {};
    coordinator.setBoundary(owner, first);
    const second = add("read", { path: "b.ts" }, "live");
    coordinator.activate(second, "card");
    coordinator.setBoundary(owner);
    expect(coordinator.run(second)?.opened).toBe(true);
    coordinator.result(second, result(), "success");
    coordinator.settle();
    expect(roles()).toEqual(["card", "card"]);

    coordinator.setBoundary(owner, first);
    coordinator.activate(first, "collapse");
    expect(roles()).toEqual(["leader", "card"]);
    coordinator.setBoundary(owner);
    expect(roles()).toEqual(["card", "card"]);
    coordinator.activate(second, "collapse");
    expect(roles()).toEqual(["leader", "hidden"]);
  } finally {
    coordinator.dispose();
  }
});

it("keeps thinking boundaries out of run settlement and preserves opened state", () => {
  const { coordinator, add, roles } = summaryFixture();

  try {
    const owner = {};
    const first = add("read", { path: "a.ts" }, "live");
    coordinator.result(first, result(), "success");
    coordinator.setBoundary(owner, first, "group");
    expect(roles()).toEqual(["card"]);
    const second = add("read", { path: "b.ts" }, "live");
    coordinator.result(second, result(), "success");
    expect(coordinator.group(first)).toBeUndefined();
    expect(coordinator.group(second)).toBeUndefined();
    expect(coordinator.run(first)?.members).toEqual([first, second]);
    expect(roles()).toEqual(["card", "card"]);

    coordinator.setBoundary(owner);
    expect(coordinator.group(first)?.members).toEqual([first, second]);
    expect(roles()).toEqual(["card", "card"]);
    coordinator.setBoundary(owner, first, "group");
    coordinator.settle();
    expect(roles()).toEqual(["leader", "hidden"]);
    coordinator.setBoundary(owner);
    expect(roles()).toEqual(["leader", "hidden"]);

    coordinator.activate(second, "card");

    for (const after of [first, undefined, first]) {
      coordinator.setBoundary(owner, after, "group");
      expect(roles()).toEqual(["card", "card"]);
      expect(coordinator.collapsible(first)).toBe(true);
      expect(coordinator.collapsible(second)).toBe(true);
    }
  } finally {
    coordinator.dispose();
  }
});

it("tracks run and group boundaries independently when owners change kind or withdraw", () => {
  const { coordinator, add, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" }, "live");
    const second = add("read", { path: "b.ts" }, "live");
    coordinator.result(first, result(), "success");
    coordinator.result(second, result(), "success");
    const thinking = {};
    const other = {};
    coordinator.setBoundary(thinking, first, "group");
    coordinator.setBoundary(other, first, "group");
    expect(coordinator.group(first)).toBeUndefined();
    expect(roles()).toEqual(["card", "card"]);

    // Prose can arrive in the same assistant component after thinking.
    coordinator.setBoundary(thinking, first, "run");
    expect(roles()).toEqual(["leader", "card"]);
    coordinator.setBoundary(other, first, "run");
    coordinator.setBoundary(thinking, first, "group");
    expect(roles()).toEqual(["leader", "card"]);
    coordinator.setBoundary(other);
    expect(roles()).toEqual(["card", "card"]);
    expect(coordinator.group(first)).toBeUndefined();
    expect(coordinator.run(first)?.members).toEqual([first, second]);

    // A permanent notice must end a run even at an existing thinking separator.
    coordinator.boundary(first);
    expect(roles()).toEqual(["leader", "card"]);
    coordinator.setBoundary(thinking);
    expect(roles()).toEqual(["leader", "card"]);
    expect(coordinator.group(first)).toBeUndefined();
    coordinator.boundary();
    expect(roles()).toEqual(["leader", "leader"]);
  } finally {
    coordinator.dispose();
  }
});

it("renders ordinary cards outside summary mode and in opened runs until the mode changes", () => {
  const { coordinator, add, invalidations, clear, roles } = summaryFixture("compact");

  try {
    const first = add("read", { path: "a.ts" });
    const second = add("bash", { command: "true" });
    expect(roles()).toEqual(["card", "card"]);
    clear();
    coordinator.setMode("summary");
    expect(roles()).toEqual(["leader", "hidden"]);
    expect([invalidations(first), invalidations(second)]).toEqual([1, 1]);

    clear();
    coordinator.activate(second, "card");
    expect(coordinator.run(first)?.opened).toBe(true);
    expect(roles()).toEqual(["card", "card"]);
    expect([invalidations(first), invalidations(second)]).toEqual([1, 1]);
    coordinator.setMode("verbose");
    coordinator.setMode("summary");
    expect(coordinator.run(first)?.opened).toBe(false);
    expect(roles()).toEqual(["leader", "hidden"]);
  } finally {
    coordinator.dispose();
  }
});

it("invalidates the summary leader for member changes, not for later runs", () => {
  const { coordinator, add, invalidations, clear } = summaryFixture();

  try {
    const leader = add("read", { path: "a.ts" });
    const member = add("bash", { command: "true" });
    clear();
    coordinator.setSavedPath(member, "/tmp/output");
    expect([invalidations(leader), invalidations(member)]).toEqual([1, 1]);

    clear();
    coordinator.boundary();
    const next = add("read", { path: "b.ts" });
    expect(invalidations(leader)).toBe(0);
    expect(invalidations(next)).toBe(0);

    // Compact mode does not re-render first members for unrelated changes.
    coordinator.setMode("compact");
    clear();
    coordinator.setSavedPath(member, "/tmp/other");
    expect(invalidations(leader)).toBe(0);
  } finally {
    coordinator.dispose();
  }
});

it("collapses a live run only after it ends at a boundary or agent end", () => {
  const { coordinator, add, invalidations, clear, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" }, "live");
    const second = add("bash", { command: "true" }, "live");
    expect(roles()).toEqual(["card", "card"]);
    coordinator.result(first, result(), "success");
    coordinator.result(second, result(), "success");
    // Finished calls stay cards: the next turn's calls may still join the run.
    expect(roles()).toEqual(["card", "card"]);
    const third = add("read", { path: "b.ts" }, "live");
    expect(coordinator.run(third)?.members).toEqual([first, second, third]);

    // A visible boundary does not end a run while a member is live.
    coordinator.setBoundary({}, third);
    expect(roles()).toEqual(["card", "card", "card"]);
    clear();
    coordinator.result(third, result(), "success");
    expect(roles()).toEqual(["leader", "hidden", "hidden"]);
    expect([invalidations(first), invalidations(second), invalidations(third)]).toEqual([1, 1, 1]);

    // Agent end ends the final run and settles its unfinished calls.
    const unfinished = add("bash", { command: "sleep 9" }, "live");
    expect(roles().at(-1)).toBe("card");
    coordinator.settle();
    expect(unfinished.lifecycle).toBe("unavailable");
    expect(roles().at(-1)).toBe("leader");
  } finally {
    coordinator.dispose();
  }
});

it("refreshes notice summaries and keeps them with their anchors across run boundaries", () => {
  const { coordinator, add, invalidations, clear } = summaryFixture();
  const notice = {
    category: { id: "instructions", count: { one: "loaded {n} file", other: "loaded {n} files" } },
    identity: "/work/src/AGENTS.md"
  };

  try {
    const first = add("read", { path: "a.ts" });
    const anchor = add("bookkeeping", {});
    coordinator.setAdapter(anchor, { ...genericAdapter, id: "omitted", omitFromSummary: true });
    const boundary = {};
    coordinator.setBoundary(boundary, first);
    expect(coordinator.summary(anchor).segments).toEqual([]);
    coordinator.activate(anchor, "card");
    expect(coordinator.collapsible(anchor)).toBe(false);
    clear();
    coordinator.addSummaryNotice(anchor, notice);
    expect(invalidations(anchor)).toBeGreaterThan(0);
    expect(invalidations(first)).toBe(0);
    expect(coordinator.collapsible(anchor)).toBe(true);
    expect(coordinator.summary(anchor).segments).toMatchObject([
      { category: notice.category, count: 1, counts: { failed: 0, cancelled: 0, unavailable: 0 } }
    ]);
    coordinator.activate(anchor, "collapse");
    expect(coordinator.summaryRole(anchor)?.kind).toBe("leader");

    coordinator.setBoundary(boundary);
    clear();
    coordinator.addSummaryNotice(anchor, { ...notice, identity: "/work/lib/AGENTS.md" });
    expect(invalidations(first)).toBeGreaterThan(0);
    expect(coordinator.summary(first).segments.map(({ count }) => count)).toEqual([1, 2]);
    coordinator.setBoundary(boundary, first);
    expect(coordinator.summary(first).segments.map(({ count }) => count)).toEqual([1]);
    expect(coordinator.summary(anchor).segments.map(({ count }) => count)).toEqual([2]);
  } finally {
    coordinator.dispose();
  }
});

it("keeps a live run open from a notice without expanding its anchor's group", () => {
  const { coordinator, add, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" }, "live");
    const second = add("read", { path: "b.ts" }, "live");
    expect(coordinator.activate(second, "notice")).toBe(false);
    expect(coordinator.run(first)?.opened).toBe(true);
    expect(coordinator.group(second)?.expanded).toBe(false);
    coordinator.result(first, result(), "success");
    coordinator.result(second, result(), "success");
    coordinator.settle();
    expect(roles()).toEqual(["card", "card"]);
    expect(coordinator.collapsible(second)).toBe(true);
    coordinator.activate(second, "collapse");
    expect(roles()).toEqual(["leader", "hidden"]);
  } finally {
    coordinator.dispose();
  }
});

it("keeps a run the user opened while live as cards once it ends", () => {
  const { coordinator, add, invalidations, clear, roles } = summaryFixture();

  try {
    const first = add("read", { path: "a.ts" }, "live");
    const second = add("bash", { command: "true" }, "live");
    clear();
    coordinator.activate(first, "card");
    expect(coordinator.run(first)?.opened).toBe(true);
    // Opening a live run changes nothing visible yet.
    expect([invalidations(first), invalidations(second)]).toEqual([0, 0]);

    coordinator.result(first, result(), "success");
    expect(coordinator.collapsible(first)).toBe(false);
    coordinator.result(second, result(), "success");
    clear();
    coordinator.settle();
    expect(roles()).toEqual(["card", "card"]);
    // Ending adds collapse controls to both ends of the run.
    expect([invalidations(first), invalidations(second)]).toEqual([1, 1]);
    expect([coordinator.collapsible(first), coordinator.collapsible(second)]).toEqual([true, true]);
    coordinator.activate(second, "collapse");
    expect(roles()).toEqual(["leader", "hidden"]);
    expect(coordinator.collapsible(first)).toBe(false);

    coordinator.activate(first, "card");
    coordinator.setMode("compact");
    expect(coordinator.collapsible(first)).toBe(false);
    coordinator.setMode("summary");
    expect(roles()).toEqual(["leader", "hidden"]);

    // Outside summary mode, clicks never mark a run.
    coordinator.boundary();
    const later = add("read", { path: "b.ts" }, "live");
    coordinator.setMode("compact");
    coordinator.activate(later, "card");
    expect(coordinator.run(later)?.opened).toBe(false);
  } finally {
    coordinator.dispose();
  }
});
