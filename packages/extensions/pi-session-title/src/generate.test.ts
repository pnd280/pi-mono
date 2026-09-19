import { fauxAssistantMessage, fauxProvider, type AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { cleanTitle, generateTitle, type TitleRegistry } from "./generate.ts";

afterEach(() => {
  vi.useRealTimers();
});

function fixture() {
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "nested/model", reasoning: true }]
  });
  const model = faux.getModel();
  const stream = vi.spyOn(faux.provider, "streamSimple");
  const registry = {
    find: vi.fn<TitleRegistry["find"]>((provider, id) =>
      provider === model.provider && id === model.id ? model : undefined
    ),
    getProvider: vi.fn<TitleRegistry["getProvider"]>(() => faux.provider),
    getApiKeyAndHeaders: vi
      .fn<TitleRegistry["getApiKeyAndHeaders"]>()
      .mockResolvedValue({ ok: true, apiKey: "fixture-key" })
  } satisfies TitleRegistry;
  const controller = new AbortController();
  const request = {
    config: { model: "title-fixture/nested/model", thinkingLevel: "low" as const },
    registry,
    source: "user: Fix authentication\n\nassistant: Check the token expiry",
    signal: controller.signal
  };
  faux.setResponses([fauxAssistantMessage("Fix token expiry")]);

  return { faux, model, stream, registry, request, controller };
}

it("passes the configured model, thinking, resolved auth, and text to Pi's effective provider", async () => {
  const { request, registry, stream, model } = fixture();
  registry.getApiKeyAndHeaders.mockResolvedValue({
    ok: true,
    apiKey: "fixture-key",
    baseUrl: "https://resolved.example.invalid",
    headers: { "X-Fixture": "value" },
    env: { FIXTURE_REGION: "region" }
  });
  expect(await generateTitle(request)).toBe("Fix token expiry");
  expect(registry.find).toHaveBeenCalledWith("title-fixture", "nested/model");
  expect(registry.getApiKeyAndHeaders).toHaveBeenCalledWith(model);
  expect(stream).toHaveBeenCalledExactlyOnceWith(
    { ...model, baseUrl: "https://resolved.example.invalid" },
    expect.any(Object),
    expect.objectContaining({
      apiKey: "fixture-key",
      headers: { "X-Fixture": "value" },
      env: { FIXTURE_REGION: "region" },
      reasoning: "low",
      maxRetries: 0,
      timeoutMs: 15_000,
      cacheRetention: "none"
    })
  );
  expect(model.baseUrl).not.toBe("https://resolved.example.invalid");
  const context = stream.mock.calls[0]?.[1];
  expect(context?.messages.map(({ role, content }) => ({ role, content }))).toEqual([
    { role: "user", content: request.source }
  ]);
  expect(context?.tools).toBeUndefined();
});

it("requests thinking off without inheriting the active model's effort", async () => {
  const { request, stream } = fixture();
  await generateTitle({ ...request, config: { ...request.config, thinkingLevel: "off" } });
  expect(stream.mock.calls[0]?.[2]?.reasoning).toBeUndefined();
});

it("refuses incomplete config, unavailable models, and unsupported thinking without a request", async () => {
  const { request, model, stream } = fixture();
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
  const { request, registry, stream } = fixture();
  registry.getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "private credential detail" });
  await expect(generateTitle(request)).rejects.toThrow("Title model authentication failed");
  expect(stream).not.toHaveBeenCalled();
});

it.each(["error", "aborted", "length", "toolUse"] as const)(
  "rejects %s responses even when they contain text",
  async (stopReason) => {
    const { request, faux } = fixture();
    faux.setResponses([fauxAssistantMessage("Partial title", { stopReason })]);
    await expect(generateTitle(request)).rejects.toThrow("complete title");
  }
);

it("does not use thinking or tool calls as a title", async () => {
  const { request, faux } = fixture();
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
  const { request, registry, stream } = fixture();

  let finish = () => {};

  registry.getApiKeyAndHeaders.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, apiKey: "late-key" });
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
  const { request, faux, controller, stream } = fixture();

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
  const { request, controller, registry } = fixture();
  controller.abort();
  expect(await generateTitle(request)).toBeUndefined();
  expect(registry.find).not.toHaveBeenCalled();
  expect(await generateTitle({ ...request, signal: new AbortController().signal })).toBe(
    "Fix token expiry"
  );
  expect(vi.getTimerCount()).toBe(0);
});
