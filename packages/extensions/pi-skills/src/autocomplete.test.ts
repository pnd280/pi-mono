import {
  CombinedAutocompleteProvider,
  type AutocompleteProvider,
  type AutocompleteSuggestions
} from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command, deferred } from "./test-fixture.ts";

const commands = [command("skill:review"), command("skill:release"), command("skill:plan")];
const options = () => ({ signal: new AbortController().signal, force: true });

function fixture(catalog = commands, enabled = true) {
  const current = new CombinedAutocompleteProvider(
    catalog.filter((item) => enabled || item.source !== "skill"),
    process.cwd()
  );
  const provider = createSkillAutocompleteProvider(current, () => catalog);

  return { current, provider };
}

describe("skill suggestions", () => {
  it.each(["Use /skill:re", "\t/skill:re", "First line\n/skill:re"])(
    "rebases %j with force false and preserves native fuzzy order and metadata",
    async (text) => {
      const { current, provider } = fixture();
      const lines = text.split("\n");
      const line = lines.length - 1;
      const col = lines[line]!.length;
      const opts = options();
      const native = await current.getSuggestions(["/skill:re"], 0, 9, { ...opts, force: false });
      const spy = vi.spyOn(current, "getSuggestions");
      const result = await provider.getSuggestions(lines, line, col, opts);
      expect(spy).toHaveBeenCalledExactlyOnceWith(["/skill:re"], 0, 9, { ...opts, force: false });
      expect(result).toEqual({ items: native!.items, prefix: "skill:re" });
    }
  );

  it.each([false, true])(
    "omits extension/template collisions with skills enabled=%s",
    async (enabled) => {
      const catalog = [
        command("skill:review", "extension"),
        command("skill:review"),
        command("skill:release", "prompt"),
        command("skill:release")
      ];
      const { provider } = fixture(catalog, enabled);
      expect(await provider.getSuggestions(["Use /skill:re"], 0, 13, options())).toBeNull();
    }
  );

  it("returns no candidates for disabled completion, unknown queries, or a foreign candidate", async () => {
    const { provider } = fixture(commands, false);
    expect(await provider.getSuggestions(["/skill:"], 0, 7, options())).toBeNull();
    const enabled = fixture().provider;
    expect(await enabled.getSuggestions(["/skill:zzzzz"], 0, 12, options())).toBeNull();
    const foreign = fixture([command("skill:review", "extension")]).provider;
    expect(await foreign.getSuggestions(["/skill:re"], 0, 9, options())).toBeNull();
  });

  it("reads membership and collisions at request time", async () => {
    let catalog = commands;
    const { current } = fixture();
    const provider = createSkillAutocompleteProvider(current, () => catalog);
    expect(await provider.getSuggestions(["/skill:re"], 0, 9, options())).not.toBeNull();
    catalog = [
      ...commands,
      command("skill:review", "prompt"),
      command("skill:release", "extension")
    ];
    expect(await provider.getSuggestions(["/skill:re"], 0, 9, options())).toBeNull();
    catalog = [];
    expect(await provider.getSuggestions(["/skill:plan"], 0, 11, options())).toBeNull();
  });
});

it("replaces the full token, preserves separators and lines, and positions the cursor", async () => {
  const { provider } = fixture();
  const lines = ["before", "  Use\t/skill:reBAD  rest", "after"];
  const suggestions = (await provider.getSuggestions(lines, 1, 15, options()))!;
  const item = suggestions.items.find((candidate) => candidate.value === "skill:review")!;
  expect(provider.applyCompletion(lines, 1, 15, item, suggestions.prefix)).toEqual({
    lines: ["before", "  Use\t/skill:review   rest", "after"],
    cursorLine: 1,
    cursorCol: 20
  });
  expect(lines[1]).toBe("  Use\t/skill:reBAD  rest");
});

it("delegates unrelated contexts, insertion, triggers, and the file gate unchanged", async () => {
  const getSuggestions = vi.fn<AutocompleteProvider["getSuggestions"]>(async () => null);
  const applyCompletion = vi.fn<AutocompleteProvider["applyCompletion"]>(
    (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })
  );
  const shouldTriggerFileCompletion = vi.fn(() => false);
  const current: AutocompleteProvider = {
    triggerCharacters: ["#"],
    getSuggestions,
    applyCompletion,
    shouldTriggerFileCompletion
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const lines = ["/model", "#issue"];
  const opts = options();
  await provider.getSuggestions(lines, 1, 6, opts);
  expect(getSuggestions).toHaveBeenCalledExactlyOnceWith(lines, 1, 6, opts);
  expect(provider.triggerCharacters).toEqual(["#"]);
  const item = { value: "skill:review", label: "skill:review" };
  provider.applyCompletion(lines, 1, 6, item, "#issue");
  expect(applyCompletion).toHaveBeenCalledExactlyOnceWith(lines, 1, 6, item, "#issue");
  expect(provider.shouldTriggerFileCompletion!(lines, 1, 6)).toBe(false);
  expect(shouldTriggerFileCompletion).toHaveBeenCalledExactlyOnceWith(lines, 1, 6);
  expect(provider.shouldTriggerFileCompletion!(["before", "/skill:re"], 1, 9)).toBe(true);
  const withoutGate = { getSuggestions, applyCompletion };
  expect(
    createSkillAutocompleteProvider(withoutGate, () => []).shouldTriggerFileCompletion!(lines, 1, 6)
  ).toBe(true);
});

it("does not claim a borrowed item reused by a delegated provider", async () => {
  const item = { value: "skill:review", label: "custom label", description: "native metadata" };
  const applyCompletion = vi.fn<AutocompleteProvider["applyCompletion"]>(
    (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })
  );
  const current: AutocompleteProvider = {
    getSuggestions: async () => ({ items: [item], prefix: "borrowed" }),
    applyCompletion
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const owned = (await provider.getSuggestions(["/skill:re"], 0, 9, options()))!;
  expect(owned.items[0]).toEqual(item);
  expect(owned.items[0]).not.toBe(item);
  const delegated = (await provider.getSuggestions(["#issue"], 0, 6, options()))!;
  provider.applyCompletion(["#issue"], 0, 6, delegated.items[0]!, delegated.prefix);
  expect(applyCompletion).toHaveBeenCalledExactlyOnceWith(["#issue"], 0, 6, item, "borrowed");
});

it("discards aborted asynchronous results and preserves the caller signal", async () => {
  const pending = deferred<AutocompleteSuggestions | null>();
  const getSuggestions = vi.fn(() => pending.promise);
  const current: AutocompleteProvider = {
    getSuggestions,
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const controller = new AbortController();
  const result = provider.getSuggestions(["/skill:re"], 0, 9, {
    signal: controller.signal,
    force: true
  });
  controller.abort();
  pending.resolve({
    items: [{ value: "skill:review", label: "skill:review" }],
    prefix: "/skill:re"
  });
  expect(await result).toBeNull();
  expect(getSuggestions).toHaveBeenCalledExactlyOnceWith(["/skill:re"], 0, 9, {
    signal: controller.signal,
    force: false
  });
  expect(
    await provider.getSuggestions(["/skill:re"], 0, 9, { signal: controller.signal })
  ).toBeNull();
  expect(getSuggestions).toHaveBeenCalledTimes(2);
});
