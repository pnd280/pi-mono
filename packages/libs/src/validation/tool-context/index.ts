import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createExtensionRuntime,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  type ExtensionToolContext
} from "@earendil-works/pi-coding-agent";

/** Native tool unit fixtures use Pi's complete context, with no registered nested tools. */
export async function createToolContext(cwd: string): Promise<ExtensionToolContext> {
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
