import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { copyNative, nativeHelpers, runHelper } from "./clipboard.ts";

const signal = () => new AbortController().signal;

it("writes complete Unicode/control/large payloads through stdin without shell interpretation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prompt-clipboard-"));
  const path = join(directory, "captured");
  const text = " \r\n\t\x1b]52;c;literal\x07 $HOME `echo nope` 界😀".repeat(20000);

  try {
    await copyNative(text, signal(), {
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

it("handles spawn, stdin and nonzero exit failures, with native-only fallbacks", async () => {
  await expect(
    runHelper({ command: "/missing/pi-prompt-native-helper", args: [] }, "text", signal())
  ).rejects.toThrow("start");
  await expect(
    runHelper(
      { command: process.execPath, args: ["-e", "process.exit(4)"] },
      "x".repeat(8 * 1024 * 1024),
      signal()
    )
  ).rejects.toThrow();
  await copyNative("text", signal(), {
    helpers: [
      { command: "/missing/helper", args: [] },
      { command: process.execPath, args: ["-e", "process.stdin.resume()"] }
    ]
  });
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
    const start = performance.now();
    await expect(copyNative("payload", signal(), { helpers })).rejects.toThrow();
    expect(performance.now() - start).toBeGreaterThanOrEqual(4900);
    expect(performance.now() - start).toBeLessThan(6500);
    const controller = new AbortController();
    const pending = copyNative("payload", controller.signal, { helpers });
    controller.abort();
    await expect(pending).rejects.toThrow();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 8000);

it("selects platform-native helpers and refuses remote/no-display/native Windows environments", () => {
  expect(nativeHelpers("darwin", {}, "")[0]?.command).toBe("pbcopy");
  expect(
    nativeHelpers("linux", { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":1" }, "").map(
      (helper) => helper.command
    )
  ).toEqual(["wl-copy", "xclip", "xsel"]);
  expect(nativeHelpers("linux", {}, "microsoft-standard-WSL2")[0]?.command).toBe("powershell.exe");
  expect(() => nativeHelpers("linux", {}, "")).toThrow("No local");
  expect(() => nativeHelpers("win32", {}, "")).toThrow("only");
  expect(() => nativeHelpers("darwin", { SSH_TTY: "/dev/pts/1" }, "")).toThrow("Remote");
});
