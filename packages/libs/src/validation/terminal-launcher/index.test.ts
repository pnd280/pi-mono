import { resolve } from "node:path";

import { expect, it, vi } from "vite-plus/test";

import type { PiLaunch } from "../pi-process/index.ts";
import { runTerminalLauncher } from "./index.ts";

function fixture(args: string[]) {
  return {
    args,
    help: "fixture help",
    createWorkspace: vi.fn(async () => process.cwd()),
    launch: vi.fn(async (directory: string): Promise<PiLaunch> => ({
      command: process.execPath,
      args: ["-e", "process.exit(0)", "--"],
      options: { cwd: directory, env: {} }
    })),
    describe: (directory: string) => [`Fixture: ${directory}`],
    log: vi.fn(),
    error: vi.fn()
  };
}

it.each(["regular", "fullscreen"])(
  "forwards %s mode and trailing arguments to a real child",
  async (mode) => {
    const options = fixture([mode, "--print", "offline"]);
    options.launch.mockImplementation(async (directory) => ({
      command: process.execPath,
      args: [
        "-e",
        `require('node:assert/strict').deepEqual(process.argv.slice(1), ${JSON.stringify(["--tui-mode", mode, "--print", "offline"])}); process.exit(7);`,
        "--"
      ],
      options: { cwd: directory, env: {} }
    }));
    expect(await runTerminalLauncher(options)).toBe(7);
    expect(options.createWorkspace).toHaveBeenCalledTimes(1);
    expect(options.log).toHaveBeenCalledWith(`Fixture: ${process.cwd()}`);
  }
);

it("validates reused workspaces without resetting them and propagates launch errors", async () => {
  const options = fixture(["regular", "--reuse", "."]);
  expect(await runTerminalLauncher(options)).toBe(0);
  expect(options.createWorkspace).not.toHaveBeenCalled();
  expect(options.launch).toHaveBeenCalledWith(resolve("."));
  options.launch.mockRejectedValueOnce(new Error("not a fixture"));
  await expect(runTerminalLauncher(options)).rejects.toThrow("not a fixture");
  options.launch.mockResolvedValueOnce({
    command: "/missing/pi-fixture-executable",
    args: [],
    options: { cwd: process.cwd(), env: {} }
  });
  await expect(runTerminalLauncher(options)).rejects.toThrow();
});
