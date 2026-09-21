import {
  fauxAssistantMessage,
  fauxProvider,
  getCurrentSystemPrompt,
  getCurrentTools,
  InMemoryCredentialStore,
  type AssistantMessage
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { cleanTitle, generateTitle } from "./generate.ts";

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
  const model = registry.find(faux.provider.id, "nested/model")!;
  const find = vi.spyOn(registry, "find");
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

  return { faux, model, find, stream, auth, registry, request, controller };
}

it("passes the configured model, thinking, resolved auth, and text to Pi's effective provider", async () => {
  const { request, registry, find, stream, auth, model } = await fixture();
  const registryStream = vi.spyOn(registry, "streamSimple");
  auth.mockResolvedValue({
    auth: {
      apiKey: "fixture-key",
      baseUrl: "https://resolved.example.invalid",
      headers: { "X-Fixture": "value" }
    },
    env: { FIXTURE_REGION: "region" }
  });
  expect(await generateTitle(request)).toBe("Fix token expiry");
  expect(find).toHaveBeenCalledWith("title-fixture", "nested/model");
  expect(registryStream).toHaveBeenCalledOnce();
  expect(stream).toHaveBeenCalledExactlyOnceWith(
    { ...model, baseUrl: "https://resolved.example.invalid" },
    expect.any(Object),
    expect.objectContaining({
      apiKey: "fixture-key",
      headers: { "X-Fixture": "value" },
      env: { FIXTURE_REGION: "region" },
      reasoning: "low",
      maxRetries: 0,
      maxTokens: 1024,
      timeoutMs: 15_000,
      cacheRetention: "none"
    })
  );
  expect(model.baseUrl).not.toBe("https://resolved.example.invalid");
  const context = stream.mock.calls[0]![1];
  expect(
    context.messages
      .filter(({ role }) => role !== "system")
      .map(({ role, content }) => ({ role, content }))
  ).toEqual([{ role: "user", content: request.source }]);
  expect(getCurrentSystemPrompt(context.messages)).toContain("Write only a short title");
  expect(getCurrentTools(context.messages)).toEqual([]);
});

it("requests thinking off without inheriting the active model's effort", async () => {
  const { request, stream } = await fixture();
  await generateTitle({ ...request, config: { ...request.config, thinkingLevel: "off" } });
  expect(stream.mock.calls[0]?.[2]?.reasoning).toBeUndefined();
});

it("refuses incomplete config, unavailable models, and unsupported thinking without a request", async () => {
  const { request, model, stream } = await fixture();
  await expect(generateTitle({ ...request, config: undefined })).rejects.toThrow(
    "global or trusted project settings.json"
  );
  await expect(
    generateTitle({ ...request, config: { ...request.config, model: "missing/model" } })
  ).rejects.toThrow("unavailable");
  model.thinkingLevelMap = { low: null };
  await expect(generateTitle(request)).rejects.toThrow("unsupported");
  expect(stream).not.toHaveBeenCalled();
});

it("reports authentication failure without exposing the provider's error content", async () => {
  const { request, auth, stream } = await fixture();
  auth.mockRejectedValue(new Error("private credential detail"));
  await expect(generateTitle(request)).rejects.toThrow(
    "The title model did not return a complete title. Check Pi's provider setup."
  );
  expect(stream).not.toHaveBeenCalled();
});

it.each(["error", "aborted", "length", "toolUse"] as const)(
  "rejects %s responses even when they contain text",
  async (stopReason) => {
    const { request, faux } = await fixture();
    faux.setResponses([fauxAssistantMessage("Partial title", { stopReason })]);
    await expect(generateTitle(request)).rejects.toThrow("complete title");
  }
);

it("does not use thinking or tool calls as a title", async () => {
  const { request, faux } = await fixture();
  faux.setResponses([fauxAssistantMessage([{ type: "thinking", thinking: "Hidden reasoning" }])]);
  await expect(generateTitle(request)).rejects.toThrow("empty session title");
});

it("sanitizes titles and truncates without splitting graphemes", () => {
  expect(cleanTitle('\u001b]0;unsafe\u0007"Fix\r\n token\t expiry"\u001b[2J')).toBe(
    "Fix token expiry"
  );
  expect(cleanTitle("a".repeat(79) + "👩‍💻 trailing")).toBe("a".repeat(79));
  expect(() => cleanTitle("\u001b[31m\u0000\u001b[0m")).toThrow("empty");
  expect(() => cleanTitle("a" + "\u0301".repeat(100))).toThrow("empty");
});

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
  const outcome = expect(generateTitle(request)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15_000);
  await outcome;
  finish();
  await vi.runAllTimersAsync();
  expect(stream).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels promptly even when the provider ignores the abort signal", async () => {
  const { request, faux, controller, stream } = await fixture();

  let finish: (message: AssistantMessage) => void = () => {};

  faux.setResponses([
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  ]);
  const result = generateTitle(request);
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
  controller.abort();
  expect(await result).toBeUndefined();
  finish(fauxAssistantMessage("Late title"));
});

it("does no work for an already canceled request and removes deadlines after success", async () => {
  vi.useFakeTimers();
  const { request, controller, find } = await fixture();
  controller.abort();
  expect(await generateTitle(request)).toBeUndefined();
  expect(find).not.toHaveBeenCalled();
  expect(await generateTitle({ ...request, signal: new AbortController().signal })).toBe(
    "Fix token expiry"
  );
  expect(vi.getTimerCount()).toBe(0);
});
