import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createExtensionRuntime,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  type ExtensionToolContext
} from "@earendil-works/pi-coding-agent";
import { onTestFinished, vi } from "vite-plus/test";

import { isolateEnvironment } from "../pi-process/environment.ts";

/**
 * Native tool unit fixtures use Pi's complete context, with no registered nested tools. Call it
 * in a test or `beforeEach`; the environment stays isolated until the test finishes.
 */
export async function createToolContext(cwd: string): Promise<ExtensionToolContext> {
  // Outside a test this throws before the fixture creates anything.
  onTestFinished(() => void vi.unstubAllEnvs());
  const directory = mkdtempSync(join(tmpdir(), "pi-tool-context-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  isolateEnvironment(directory);
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  const extensionRuntime = createExtensionRuntime();
  extensionRuntime.getThinkingLevel = () => "off";
  const runner = new ExtensionRunner(
    [],
    extensionRuntime,
    cwd,
    SessionManager.inMemory(cwd),
    new ModelRegistry(runtime)
  );

  return runner.createToolContext("fixture", undefined);
}
