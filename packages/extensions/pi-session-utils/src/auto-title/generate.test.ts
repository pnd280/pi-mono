import { fauxAssistantMessage, fauxProvider, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { generateTitle, TitleError } from "./generate.ts";

afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "nested/model", reasoning: true }]
  });
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  runtime.registerNativeProvider(faux.provider);
  await runtime.refresh({ allowNetwork: false, providers: [faux.provider.id] });
  const registry = new ModelRegistry(runtime);
  const stream = vi.spyOn(faux.provider, "streamSimple");
  const auth = vi.spyOn(faux.provider.auth.apiKey!, "resolve");
  const controller = new AbortController();
  const request = {
    config: { model: "title-fixture/nested/model", thinkingLevel: "low" as const },
    registry,
    source: "user: Fix authentication\n\nassistant: Check the token expiry",
    signal: controller.signal
  };
  faux.setResponses([fauxAssistantMessage("Fix token expiry")]);

  return { stream, auth, request, controller };
}

it("times out stalled authentication and never starts transport afterward", async () => {
  vi.useFakeTimers();
  const { request, auth, stream } = await fixture();

  let finish = () => {};

  auth.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ auth: { apiKey: "late-key" } });
      })
  );
  let settled = false;
  const result = generateTitle(request).finally(() => {
    settled = true;
  });
  const outcome = expect(result).rejects.toThrow(TitleError);
  await vi.advanceTimersByTimeAsync(14_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await outcome;
  finish();
  await vi.runAllTimersAsync();
  expect(stream).not.toHaveBeenCalled();
});

it("does not start authentication or transport for an already canceled request", async () => {
  const { request, controller, auth, stream } = await fixture();
  controller.abort();
  expect(await generateTitle(request)).toBeUndefined();
  expect(auth).not.toHaveBeenCalled();
  expect(stream).not.toHaveBeenCalled();
});
