import { describe, expect, it } from "vite-plus/test";

import { modelReferenceSchema, splitModelReference } from "./model-reference.ts";

describe("model references", () => {
  it("trims settings and keeps slashes in the model ID", () => {
    expect(modelReferenceSchema.parse("  openrouter/anthropic/claude-sonnet \n")).toBe(
      "openrouter/anthropic/claude-sonnet"
    );
    expect(splitModelReference("openrouter/anthropic/claude-sonnet")).toStrictEqual({
      provider: "openrouter",
      id: "anthropic/claude-sonnet"
    });
  });

  it.each(["gpt-5", "/gpt-5", "openai/", "open ai/gpt-5", "openai/gpt 5"])(
    "rejects %j without a provider and model ID",
    (reference) => {
      expect(modelReferenceSchema.safeParse(reference).success).toBe(false);
      expect(() => splitModelReference(reference)).toThrow(TypeError);
    }
  );
});
