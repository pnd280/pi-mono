import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  initTheme,
  parseSessionEntries,
  SessionManager,
  type JsonAgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { renderingTui } from "../src/test-fixture.ts";
import { METADATA_TYPE, parseDisplayRecord } from "../src/transcript/metadata.ts";
import {
  TRANSCRIPT_TYPE,
  TranscriptRecordIndex,
  parseTranscriptRecord
} from "../src/transcript/records.ts";
import {
  createTranscriptModel,
  createTranscriptViewer,
  summarizeRun
} from "../src/viewer/index.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("runs fixed plans through the installed CLI and resumes without replaying mutations", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory);

    const run = async (prompt: string, json = false) => {
      const execution = promisify(execFile)(
        launch.command,
        [...launch.args, "--print", ...(json ? ["--mode", "json"] : []), prompt],
        {
          ...launch.options,
          timeout: 15000
        }
      );
      execution.child.stdin?.end();
      const { stdout, stderr } = await execution;
      expect(stderr).not.toContain("Failed to load extension");

      return stdout;
    };

    const events = await run("diff", true);
    expect(events).toContain("Fixture finished: diff.");
    const changed = await readFile(join(directory, "work", "a.ts"), "utf8");
    expect(changed).toBe('export const label = "after";\n');
    expect(await readFile(join(directory, "work", "created.ts"), "utf8")).toContain("界😀");
    expect(await run("public")).toContain("Fixture finished: public.");
    expect(await readFile(join(directory, "work", "a.ts"), "utf8")).toBe(changed);
    expect(await run("not a scenario; exit 19")).toContain("Choose a fixture prompt:");

    const source = await readFile(join(directory, "session.jsonl"), "utf8");
    const parsed = parseSessionEntries(source);
    const manager = SessionManager.inMemory(join(directory, "work"), undefined, parsed);
    const entries = manager.getBranch();
    const results = entries.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []
    );
    expect(results.map((result) => result.toolName)).toEqual([
      "write",
      "edit",
      "edit",
      "display_fixture_read"
    ]);
    expect(results.every((result) => !result.isError)).toBe(true);
    expect(results.at(-1)?.content).toEqual([{ type: "text", text: changed }]);
    expect(
      entries.filter(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === METADATA_TYPE &&
          parseDisplayRecord(entry.data)?.fact.kind === "change"
      )
    ).toHaveLength(3);
    const metadata = new TranscriptRecordIndex(entries);
    expect([...metadata.calls.values()].map((record) => record.name)).toEqual([
      "write",
      "edit",
      "edit",
      "display_fixture_read"
    ]);
    expect(
      SessionManager.inMemory(directory, undefined, entries)
        .buildSessionProjection()
        .messages.some(
          (message) => message.role === "custom" && message.customType === TRANSCRIPT_TYPE
        )
    ).toBe(false);
    initTheme();
    const snapshot = {
      sessionId: manager.getSessionId(),
      cwd: manager.getCwd(),
      entries,
      leafId: manager.getLeafId()
    };
    const borrowed = JSON.stringify(snapshot);
    const model = createTranscriptModel(snapshot);

    try {
      const calls = [...model.display.coordinator.calls.values()];
      expect(calls.slice(0, 3).map((call) => call.adapter.id)).toEqual([
        "pi:write",
        "pi:edit",
        "pi:edit"
      ]);
      const final = [...metadata.runs.values()].find(({ record }) => record.final)!;
      expect(summarizeRun(model, final.record)).toBeDefined();
      const unsupported = entries.map((entry) => {
        if (entry.type !== "custom" || entry.customType !== TRANSCRIPT_TYPE) return entry;
        const record = parseTranscriptRecord(entry.data);
        if (record?.kind !== "call" || record.selection.kind !== "adapter") return entry;

        return { ...entry, data: { ...record, selection: { ...record.selection, version: 999 } } };
      });
      model.replace({ ...snapshot, entries: unsupported });
      expect(
        [...model.display.coordinator.calls.values()]
          .slice(0, 3)
          .every((call) => call.adapter.id === "generic")
      ).toBe(true);
      expect(summarizeRun(model, final.record)).toBeUndefined();
      const contradictory = entries.map((entry) => {
        if (entry.type !== "custom" || entry.customType !== TRANSCRIPT_TYPE) return entry;
        const record = parseTranscriptRecord(entry.data);
        if (record?.kind !== "call" || record.selection.kind !== "adapter" || !record.source)
          return entry;

        return { ...entry, data: { ...record, source: { ...record.source, source: "sdk" } } };
      });
      model.replace({ ...snapshot, entries: contradictory });
      expect(
        [...model.display.coordinator.calls.values()].slice(0, 3).map((call) => call.adapter.id)
      ).toEqual(["generic", "generic", "generic"]);
      const foreign = entries.map((entry) => {
        if (entry.type !== "custom" || entry.customType !== TRANSCRIPT_TYPE) return entry;
        const record = parseTranscriptRecord(entry.data);

        return record ? { ...entry, data: { ...record, sessionId: "different-session" } } : entry;
      });
      model.replace({ ...snapshot, entries: foreign });
      expect(
        [...model.display.coordinator.calls.values()].slice(0, 3).map((call) => call.adapter.id)
      ).toEqual(["generic", "generic", "generic"]);
      expect(
        summarizeRun(model, { ...final.record, sessionId: "different-session" })
      ).toBeUndefined();
      model.replace(snapshot);
      expect(
        summarizeRun(model, final.record, {
          sessionId: "another-child",
          generation: final.record.generation
        })
      ).toBeUndefined();
      expect(
        summarizeRun(model, {
          ...final.record,
          segments: [{ category: "read", count: 99, failed: 0, cancelled: 0, unavailable: 0 }]
        })
      ).toBeUndefined();
      // A newly attached viewer can observe execution before its source call is in a snapshot.
      const wireEvents = events
        .trim()
        .split("\n")
        .map((line) => {
          // The installed CLI produces the public JSON event contract.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          return JSON.parse(line) as JsonAgentSessionEvent;
        });
      const execution = wireEvents.find((event) => event.type === "tool_execution_start")!;
      const assistant = entries.find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          entry.message.content.some(
            (block) => block.type === "toolCall" && block.id === execution.toolCallId
          )
      )!;
      const liveSnapshot = { ...snapshot, leafId: assistant.id };
      const reconnect = createTranscriptModel({ ...snapshot, entries: [], leafId: null });

      try {
        reconnect.event(execution);
        reconnect.replace(liveSnapshot);
        const call = reconnect.display.coordinator.byId(execution.toolCallId)!;
        expect(call.lifecycle).toBe("executing");
        // Once resolved, the event cannot attach to the same ID at a different timestamp.
        reconnect.replace({
          ...liveSnapshot,
          entries: entries.map((entry) =>
            entry.id === assistant.id && entry.type === "message"
              ? {
                  ...entry,
                  message: { ...entry.message, timestamp: call.reference.messageTimestamp + 1 }
                }
              : entry
          )
        });
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        reconnect.replace(liveSnapshot);
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "executing"
        );
        reconnect.event({ type: "agent_settled" });
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        reconnect.replace(liveSnapshot);
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        reconnect.event({
          ...execution,
          type: "tool_execution_update",
          partialResult: { content: [{ type: "text", text: "retained partial output" }] }
        });
        reconnect.event({ type: "agent_settled" });
        reconnect.replace(liveSnapshot);
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.result?.content).toEqual([
          { type: "text", text: "retained partial output" }
        ]);
        reconnect.event({ ...execution, toolCallId: "next-call" });
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        reconnect.event(execution);
        reconnect.replace({ ...liveSnapshot, historical: true });
        reconnect.replace(liveSnapshot);
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        for (const event of wireEvents.filter((event) => event.type === "tool_execution_end"))
          reconnect.event(event);
        reconnect.event({ type: "agent_settled" });
        reconnect.replace(liveSnapshot);
        const completed = reconnect.display.coordinator.byId(execution.toolCallId)!;
        expect(completed.lifecycle).toBe("complete");
        expect(completed.outcome).toBe("success");
        expect(reconnect.display.coordinator.run(completed)?.ended).toBe(true);
        // A settled call can also exist only in the wire buffer until the next snapshot.
        assert(assistant.type === "message", "Expected the source message");
        reconnect.replace({ ...snapshot, entries: [], leafId: null, historical: true });
        reconnect.event({ type: "message_start", message: assistant.message });
        reconnect.event({ type: "agent_settled" });
        reconnect.replace({ ...snapshot, entries: [], leafId: null });
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
        reconnect.event({ ...execution, toolCallId: "next-call" });
        expect(reconnect.display.coordinator.byId(execution.toolCallId)?.lifecycle).toBe(
          "unavailable"
        );
      } finally {
        reconnect.dispose();
      }

      // Initial snapshot overlaps buffered JSON events. Committed calls/results win once.

      for (const line of events.trim().split("\n")) {
        // The installed CLI is the producer of the public JSON event contract.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const event = JSON.parse(line) as JsonAgentSessionEvent;
        model.event(event);
      }

      model.replace(snapshot);
      expect(
        [...model.display.coordinator.calls.values()].map((call) => [call.name, call.outcome])
      ).toEqual([
        ["write", "success"],
        ["edit", "success"],
        ["edit", "success"],
        ["display_fixture_read", "success"]
      ]);
      expect(summarizeRun(model, final.record)).toBeDefined();
      // An authoritative context edit must also supersede overlapping execution events.
      const edited = SessionManager.inMemory(snapshot.cwd, undefined, parsed);
      const firstResult = entries.find(
        (entry) => entry.type === "message" && entry.message.role === "toolResult"
      )!;
      edited.appendContextEdit(firstResult.id, null);
      model.replace({ ...snapshot, entries: edited.getEntries(), leafId: edited.getLeafId() });

      const assertOmittedResult = () => {
        const first = [...model.display.coordinator.calls.values()][0];
        expect(first?.result).toBeUndefined();
        expect(first?.lifecycle).toBe("unavailable");
        expect(first?.outcome).toBe("unavailable");
      };

      assertOmittedResult();

      for (const line of events.trim().split("\n")) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        model.event(JSON.parse(line) as JsonAgentSessionEvent);
      }

      assertOmittedResult();
      model.replace(snapshot);
      const fork = entries.find(
        (entry) => entry.type === "message" && entry.message.role === "assistant"
      )!;
      model.event({ type: "agent_start" });
      model.replace({ ...snapshot, leafId: fork.id });
      expect(
        [...model.display.coordinator.calls.values()].map((call) => [call.adapter.id, call.outcome])
      ).toEqual([
        ["generic", "unavailable"],
        ["generic", "unavailable"],
        ["generic", "unavailable"]
      ]);
      model.event({ type: "agent_start" });
      model.replace({ ...snapshot, leafId: fork.id, historical: true });
      expect(
        [...model.display.coordinator.calls.values()].every(
          (call) => call.lifecycle === "unavailable"
        )
      ).toBe(true);
      model.replace(snapshot);
      const lastUser = entries
        .filter((entry) => entry.type === "message" && entry.message.role === "user")
        .at(-1)!;
      manager.appendCompaction("Earlier operations summarised", lastUser.id, 1000);
      model.replace({ ...snapshot, entries: manager.getEntries(), leafId: manager.getLeafId() });
      expect(model.display.coordinator.calls.size).toBe(0);

      for (const line of events.trim().split("\n")) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        model.event(JSON.parse(line) as JsonAgentSessionEvent);
      }

      expect(model.display.coordinator.calls.size).toBe(0);
      model.replace(snapshot);
      const redraw = vi.fn();
      const viewer = createTranscriptViewer(model, {
        ui: renderingTui(),
        theme: {
          fg: (_color, text) => text,
          bg: (_color, text) => text,
          bold: (text) => text,
          getBgAnsi: () => ""
        },
        cwd: snapshot.cwd,
        fullscreen: true,
        requestRender: redraw
      });
      viewer.render(80);
      viewer.setMode("verbose");
      viewer.render(40);
      viewer.dispose();
      redraw.mockClear();
      model.replace(snapshot);
      expect(redraw).not.toHaveBeenCalled();
      model.dispose();
      const revision = model.revision;
      model.replace({ ...snapshot, sessionId: "replacement" });
      model.event({ type: "agent_settled" });
      expect(model.revision).toBe(revision);
    } finally {
      model.dispose();
    }

    expect(JSON.stringify(snapshot)).toBe(borrowed);
    expect(await readFile(join(directory, "session.jsonl"), "utf8")).toBe(source);
    expect(await readFile(join(directory, "work", "a.ts"), "utf8")).toBe(changed);

    await run("saved-output");
    const outputSession = SessionManager.inMemory(
      directory,
      undefined,
      parseSessionEntries(await readFile(join(directory, "session.jsonl"), "utf8"))
    );
    const readSavedOutput = vi.fn(async (path: string) => ({
      path,
      text: await readFile(path, "utf8")
    }));
    const outputModel = createTranscriptModel(
      {
        sessionId: outputSession.getSessionId(),
        cwd: directory,
        entries: outputSession.getEntries(),
        leafId: outputSession.getLeafId(),
        historical: true
      },
      { readSavedOutput }
    );
    const call = [...outputModel.display.coordinator.calls.values()].find(
      (call) => call.savedPath
    )!;
    expect(call.savedPath).toBeDefined();

    try {
      await writeFile(call.savedPath!, "newer external output");
      outputModel.display.coordinator.expand(call, true);
      await vi.waitFor(() => expect(call.savedOutput).toBeDefined());
      expect(readSavedOutput).not.toHaveBeenCalled();
      expect(call.savedOutput?.text).toBeUndefined();
    } finally {
      outputModel.dispose();
      await rm(call.savedPath!, { force: true });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
