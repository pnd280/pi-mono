import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { fingerprintProbe } from "./fingerprints.ts";

it("isolates fingerprint inspection from implicit extensions, credentials, and model prompts", () => {
  const parentEnv = Object.freeze({
    PATH: "/system/bin",
    SystemRoot: "C:\\Windows",
    HOME: "/personal/home",
    USERPROFILE: "C:\\Users\\personal",
    PI_CODING_AGENT_DIR: "/personal/agent",
    OPENAI_API_KEY: "dummy-openai-key",
    ANTHROPIC_API_KEY: "dummy-anthropic-key",
    AWS_PROFILE: "personal",
    GOOGLE_APPLICATION_CREDENTIALS: "/personal/credentials.json",
    NODE_OPTIONS: "--import=/personal/extension.mjs",
    PI_OFFLINE: "0",
    PI_TELEMETRY: "1"
  });
  const probe = fingerprintProbe("/installed/cli.js", "/explicit/fingerprints.ts", "/isolated", parentEnv);

  expect(probe.args).toEqual([
    "/installed/cli.js", "--no-extensions", "-e", "/explicit/fingerprints.ts", "--help"
  ]);
  expect(probe.cwd).toBe("/isolated");
  expect(probe.env).toEqual({
    PATH: "/system/bin",
    SystemRoot: "C:\\Windows",
    HOME: "/isolated",
    USERPROFILE: "/isolated",
    PI_CODING_AGENT_DIR: join("/isolated", "agent"),
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0"
  });
});
