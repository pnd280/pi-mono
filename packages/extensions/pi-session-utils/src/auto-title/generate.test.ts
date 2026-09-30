import {
  fauxAssistantMessage,
  fauxProvider,
  InMemoryCredentialStore,
  type AssistantMessage
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createFixtureStream } from "@pi-mono/libs/validation/provider";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { cleanTitle, generateTitle, TitleError, type TitleRegistry } from "./generate.ts";

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

  return { faux, model, stream, auth, request, controller, runtime };
}

it("sends the configured model, text, thinking, and request budgets through Pi's registry", async () => {
  const model = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "nested/model", reasoning: true }]
  }).getModel();
  const originalModel = structuredClone(model);
  const stream = vi.fn<TitleRegistry["streamSimple"]>((requestedModel, _context, options) =>
    createFixtureStream({
      model: requestedModel,
      signal: options?.signal,
      run: async ({ text }) => {
        text('"Fix token expiry"');

        return "stop";
      }
    })
  );
  const registry: TitleRegistry = {
    find: (provider, id) =>
      provider === "title-fixture" && id === "nested/model" ? model : undefined,
    streamSimple: stream
  };
  const source = "Fix authentication by checking token expiry";
  expect(
    await generateTitle({
      config: { model: "title-fixture/nested/model", thinkingLevel: "low" },
      registry,
      source,
      signal: new AbortController().signal
    })
  ).toBe("Fix token expiry");
  expect(stream).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ provider: "title-fixture", id: "nested/model" }),
    expect.objectContaining({
      messages: [expect.objectContaining({ role: "user", content: source })]
    }),
    expect.objectContaining({
      reasoning: "low",
      maxRetries: 0,
      maxTokens: 1024,
      timeoutMs: 15_000,
      cacheRetention: "none"
    })
  );
  expect(stream.mock.calls[0]![1].tools ?? []).toEqual([]);
  expect(model).toEqual(originalModel);
});

it.each([512, 16384])(
  "caps virtual title requests to the routed model's %i-token limit",
  async (limit) => {
    const { request, model, stream, runtime } = await fixture();
    model.maxTokens = limit;
    runtime.registerVirtualModel({
      provider: "title-fixture",
      id: "router",
      name: "Title router",
      route: () => ({ model, thinkingLevel: "off" })
    });
    await runtime.refresh({ allowNetwork: false });
    expect(request.registry.find("title-fixture", "router")?.maxTokens).toBe(0);
    expect(
      await generateTitle({
        ...request,
        config: { model: "title-fixture/router", thinkingLevel: "off" }
      })
    ).toBe("Fix token expiry");
    expect(stream).toHaveBeenCalledOnce();
    expect(stream.mock.calls[0]?.[0]).toBe(model);
    expect(stream.mock.calls[0]?.[2]?.maxTokens).toBe(Math.min(limit, 1024));
  }
);

it("requests thinking off without inheriting the active model's effort", async () => {
  const { request, stream } = await fixture();
  await generateTitle({ ...request, config: { ...request.config, thinkingLevel: "off" } });
  expect(stream.mock.calls[0]?.[2]?.reasoning).toBeUndefined();
});

it("refuses incomplete config, unavailable models, and unsupported thinking without a request", async () => {
  const { request, model, stream } = await fixture();
  await expect(generateTitle({ ...request, config: undefined })).rejects.toThrow(TitleError);
  await expect(
    generateTitle({ ...request, config: { ...request.config, model: "missing/model" } })
  ).rejects.toThrow(TitleError);
  model.thinkingLevelMap = { low: null };
  await expect(generateTitle(request)).rejects.toThrow(TitleError);
  expect(stream).not.toHaveBeenCalled();
});

it("reports authentication failure without exposing the provider's error content", async () => {
  const { request, auth, stream } = await fixture();
  const secret = "private credential detail";
  const excludesSecret: unknown = expect.not.stringContaining(secret);
  auth.mockRejectedValue(new Error(secret));
  await expect(generateTitle(request)).rejects.toThrow(
    expect.objectContaining({ message: excludesSecret })
  );
  expect(stream).not.toHaveBeenCalled();
});

it.each(["error", "aborted", "length", "toolUse"] as const)(
  "rejects %s responses even when they contain text",
  async (stopReason) => {
    const { request, faux } = await fixture();
    faux.setResponses([fauxAssistantMessage("Partial title", { stopReason })]);
    await expect(generateTitle(request)).rejects.toThrow(TitleError);
  }
);

it("rejects a thinking-only response rather than exposing reasoning as a title", async () => {
  const { request, faux } = await fixture();
  faux.setResponses([fauxAssistantMessage([{ type: "thinking", thinking: "Hidden reasoning" }])]);
  await expect(generateTitle(request)).rejects.toThrow(TitleError);
});

it("sanitizes titles and truncates without splitting graphemes", () => {
  expect(cleanTitle('\u001b]0;unsafe\u0007"Fix\r\n token\t expiry"\u001b[2J')).toBe(
    "Fix token expiry"
  );
  expect(cleanTitle("a".repeat(79) + "👩‍💻 trailing")).toBe("a".repeat(79));
  expect(() => cleanTitle("\u001b[31m\u0000\u001b[0m")).toThrow(TitleError);
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

it("does not start authentication or transport for an already canceled request", async () => {
  const { request, controller, auth, stream } = await fixture();
  controller.abort();
  expect(await generateTitle(request)).toBeUndefined();
  expect(auth).not.toHaveBeenCalled();
  expect(stream).not.toHaveBeenCalled();
});
