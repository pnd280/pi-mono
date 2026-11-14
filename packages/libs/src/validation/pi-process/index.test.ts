import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it, vi } from "vite-plus/test";

import { isolateEnvironment } from "./environment.ts";
import { createPiLaunch, createValidationWorkspace } from "./index.ts";

it("creates private fixture directories and prepares credential-free offline Pi launches and in-process environments", async () => {
  const directory = await createValidationWorkspace("pi-libs-validation-");
  // isolateEnvironment creates its own home child, which the workspace already has.
  const inProcess = await mkdtemp(join(tmpdir(), "pi-libs-isolation-"));
  vi.stubEnv("ANTHROPIC_API_KEY", "must-not-inherit");
  vi.stubEnv("HOME", "/must-not-use");
  vi.stubEnv("PI_CODING_AGENT_DIR", "/must-not-use/agent");
  vi.stubEnv("SSH_CONNECTION", "must-not-inherit");
  vi.stubEnv("DISPLAY", ":must-not-inherit");

  try {
    for (const name of ["", "work", "home", "agent", "tmp"]) {
      const info = await stat(join(directory, name));
      expect(info.isDirectory()).toBe(true);
      if (process.platform !== "win32") expect(info.mode & 0o777).toBe(0o700);
    }

    const args = ["--offline", "--no-session", "--no-extensions", "--print"];
    const launch = await createPiLaunch({
      directory,
      args,
      env: {
        PATH: "/fixture/bin",
        DISPLAY: ":fixture",
        HOME: "/override-refused",
        PI_CODING_AGENT_DIR: "/override-refused",
        PI_OFFLINE: "0",
        PI_TELEMETRY: "1"
      }
    });
    expect(launch.command).toBe(process.execPath);
    await access(launch.args[0]!);
    expect(launch.args.slice(1)).toEqual(args);
    expect(launch.options.cwd).toBe(join(directory, "work"));
    expect(launch.options.env).toMatchObject({
      PATH: "/fixture/bin",
      DISPLAY: ":fixture",
      HOME: join(directory, "home"),
      USERPROFILE: join(directory, "home"),
      TMPDIR: join(directory, "tmp"),
      TMP: join(directory, "tmp"),
      TEMP: join(directory, "tmp"),
      PI_CODING_AGENT_DIR: join(directory, "agent"),
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0"
    });
    expect(launch.options.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(launch.options.env).not.toHaveProperty("SSH_CONNECTION");
    const defaults = await createPiLaunch({ directory, args: [] });
    expect(defaults.options.env).not.toHaveProperty("DISPLAY");

    isolateEnvironment(inProcess);
    expect(process.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(process.env).not.toHaveProperty("SSH_CONNECTION");
    expect(process.env).toMatchObject({
      HOME: join(inProcess, "home"),
      USERPROFILE: join(inProcess, "home"),
      PI_CODING_AGENT_DIR: join(inProcess, "agent"),
      PI_OFFLINE: "1"
    });
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
    await rm(inProcess, { recursive: true, force: true });
  }
});
