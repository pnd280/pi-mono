import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEditToolDefinition,
  createWriteToolDefinition,
  defineTool,
  SessionManager,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { deferred } from "../test-fixture.ts";
import { observeMutationDefinition, type FileMutation, type PatchLimits } from "./index.ts";

vi.mock("node:fs/promises", { spy: true });

const directories: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const directory = await fs.mkdtemp(join(tmpdir(), "file-mutations-"));
  directories.push(directory);
  const context = { cwd: directory, sessionManager: SessionManager.inMemory(directory) };

  // Native edit/write factories only read cwd from the extension context.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { directory, context: context as unknown as ExtensionContext };
}

const limits: PatchLimits = {
  maxSourceBytes: 1024 * 1024,
  maxPatchBytes: 128 * 1024,
  maxEditLength: 2000,
  timeoutMs: 50,
  contextLines: 4
};

it("shares edit I/O and the native patch across consumers, with no observation read", async () => {
  const { directory, context } = await fixture();
  const path = join(directory, "file");
  const before = "unchanged\n".repeat(10000) + "before\n";
  await fs.writeFile(path, before);
  const read = vi.mocked(fs.readFile).mockClear();
  const open = vi.mocked(fs.open).mockClear();
  const writes = vi.mocked(fs.writeFile).mockClear();
  const observations: FileMutation[] = [];
  const tool = observeMutationDefinition(
    defineTool(createEditToolDefinition(directory)),
    directory,
    () =>
      [0, 1].map(() => ({
        maxSourceBytes: limits.maxSourceBytes,
        completed: (change) => {
          observations.push(change);
        }
      }))
  );
  const result = await tool.execute(
    "edit",
    { path, edits: [{ oldText: "before", newText: "after" }] },
    undefined,
    undefined,
    context
  );
  expect(read).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  expect(writes).toHaveBeenCalledTimes(1);
  expect(observations).toHaveLength(2);
  expect(observations[0]).toBe(observations[1]);
  expect(observations[0]?.before).toEqual({ status: "ready", text: before });
  const pending = observations[0]!.patch(limits);
  expect(observations[1]!.patch(limits)).toBe(pending);
  const patch = await pending;
  const nativePatch: unknown = Reflect.get(result.details ?? {}, "patch");
  expect(patch).toEqual({ status: "ready", patch: nativePatch });
  expect(
    await observations[0]!.patch({ ...limits, maxSourceBytes: 0, maxEditLength: 0, timeoutMs: 0 })
  ).toEqual(patch);
  expect(await observations[0]!.patch({ ...limits, maxPatchBytes: 0 })).toEqual({
    status: "patch-too-large"
  });
  expect(() => observations[0]!.patch({ ...limits, timeoutMs: NaN })).toThrow(RangeError);
});

it("shares one pre-write read, memoizes generated patches, and preserves alias mutation order", async () => {
  const { directory, context } = await fixture();
  await fs.mkdir(join(directory, "real"));
  await fs.symlink(join(directory, "real"), join(directory, "alias"));
  const observations: FileMutation[] = [];
  const open = vi.mocked(fs.open).mockClear();
  const read = vi.mocked(fs.readFile).mockClear();
  const tool = observeMutationDefinition(
    defineTool(createWriteToolDefinition(directory)),
    directory,
    () =>
      [0, 1].map(() => ({
        maxSourceBytes: 1024,
        completed: (change) => {
          observations.push(change);
        }
      }))
  );
  await tool.execute(
    "create",
    { path: "alias/nested/file", content: "first\n" },
    undefined,
    undefined,
    context
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(observations[0]?.before.status).toBe("missing");
  expect(observations[0]?.path).toBe(join(directory, "real/nested/file"));
  const patch = observations[0]!.patch(limits);
  expect(observations[1]!.patch(limits)).toBe(patch);
  expect((await patch).status).toBe("ready");
  await Promise.all([
    tool.execute(
      "one",
      { path: "alias/nested/file", content: "second\n" },
      undefined,
      undefined,
      context
    ),
    tool.execute(
      "two",
      { path: "real/nested/file", content: "last\n" },
      undefined,
      undefined,
      context
    )
  ]);
  const unique = [...new Set(observations)].sort((a, b) => a.sequence - b.sequence);
  expect(unique.map((value) => value.before)).toEqual([
    { status: "missing" },
    { status: "ready", text: "first\n" },
    { status: "ready", text: "second\n" }
  ]);
});

it("isolates observer errors and reports committed writes even if cancellation hides the result", async () => {
  const { directory, context } = await fixture();
  const abort = new AbortController();
  const changes: FileMutation[] = [];
  const tool = observeMutationDefinition(
    defineTool(createWriteToolDefinition(directory)),
    directory,
    () => [
      {
        maxSourceBytes: 100,
        started: () => {
          throw new Error("observer");
        },
        completed: () => {
          throw new Error("observer");
        }
      },
      {
        maxSourceBytes: 100,
        started: () => abort.abort(),
        completed: (change) => {
          changes.push(change);
        }
      }
    ]
  );
  await expect(
    tool.execute("write", { path: "file", content: "written" }, abort.signal, undefined, context)
  ).rejects.toThrow("aborted");
  expect(await fs.readFile(join(directory, "file"), "utf8")).toBe("written");
  expect(changes[0]?.outcome).toBe("success");
  expect(changes[0]?.after).toEqual({ status: "ready", text: "written" });
});

it("awaits shared asynchronous patches and isolates rejected completion callbacks", async () => {
  const { directory, context } = await fixture();
  const requested = deferred<void>();
  const release = deferred<void>();
  const patches: ReturnType<FileMutation["patch"]>[] = [];
  const tool = observeMutationDefinition(
    defineTool(createWriteToolDefinition(directory)),
    directory,
    () =>
      [0, 1].map((index) => ({
        maxSourceBytes: 1024,
        async completed(mutation) {
          const patch = mutation.patch(limits);
          patches.push(patch);
          if (index === 1) requested.resolve();
          await patch;

          if (index === 0) {
            await release.promise;
            throw new Error("Async observer failure");
          }
        }
      }))
  );
  let finished = false;
  const execution = tool
    .execute("write", { path: "file", content: "written\n" }, undefined, undefined, context)
    .then((result) => {
      finished = true;

      return result;
    });

  try {
    await requested.promise;
    expect(patches[0]).toBe(patches[1]);
    expect((await patches[0])?.status).toBe("ready");
    expect(finished).toBe(false);
    expect(await fs.readFile(join(directory, "file"), "utf8")).toBe("written\n");
  } finally {
    release.resolve();
    await execution;
  }

  expect(finished).toBe(true);
});

it("releases the native mutation queue before awaiting observer completion", async () => {
  const { directory, context } = await fixture();
  const started = deferred<void>();
  const release = deferred<void>();
  const changes: FileMutation[] = [];
  const tool = observeMutationDefinition(
    defineTool(createWriteToolDefinition(directory)),
    directory,
    (id) => [
      {
        maxSourceBytes: 1024,
        async completed(mutation) {
          changes.push(mutation);

          if (id === "first") {
            started.resolve();
            await release.promise;
          }
        }
      }
    ]
  );
  const first = tool.execute(
    "first",
    { path: "file", content: "first\n" },
    undefined,
    undefined,
    context
  );

  try {
    await started.promise;
    await tool.execute(
      "second",
      { path: "file", content: "second\n" },
      undefined,
      undefined,
      context
    );
    expect(changes[1]?.before).toEqual({ status: "ready", text: "first\n" });
    expect(changes[1]?.sequence).toBeGreaterThan(changes[0]!.sequence);
  } finally {
    release.resolve();
    await first;
  }
});
