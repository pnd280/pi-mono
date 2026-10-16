import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import { copyNative } from "./clipboard.ts";

const signal = () => new AbortController().signal;

it("writes complete Unicode/control/large payloads through stdin without shell interpretation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prompt-clipboard-"));
  const path = join(directory, "captured");
  const text = " \r\n\t\x1b]52;c;literal\x07 $HOME `echo nope` 界😀".repeat(20000);

  try {
    await copyNative(text, signal(), {
      // The deadline has its own test; a loaded suite can slow this helper past five seconds.
      timeout: STEP_TIMEOUT_MS,
      helpers: [
        {
          command: process.execPath,
          args: [
            "-e",
            "const fs=require('node:fs'); const b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],Buffer.concat(b)));",
            path
          ]
        }
      ]
    });
    expect(await readFile(path, "utf8")).toBe(text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("has a five-second deadline and cancellation prevents later helper fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prompt-clipboard-cancel-"));
  const path = join(directory, "must-not-exist");
  const helpers = [
    { command: process.execPath, args: ["-e", "process.stdin.resume();setInterval(()=>{},1000)"] },
    {
      command: process.execPath,
      args: ["-e", "require('node:fs').writeFileSync(process.argv[1],'ran')", path]
    }
  ];

  try {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;
    const timed = copyNative("payload", signal(), { helpers }).finally(() => {
      settled = true;
    });
    const timedResult = expect(timed).rejects.toThrow("Native clipboard helper timed out.");
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await timedResult;
    vi.useRealTimers();
    const controller = new AbortController();
    const pending = copyNative("payload", controller.signal, { helpers });
    controller.abort();
    await expect(pending).rejects.toThrow();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  }
});
