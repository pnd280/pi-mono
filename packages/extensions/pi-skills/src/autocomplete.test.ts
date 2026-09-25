import {
  CombinedAutocompleteProvider,
  type AutocompleteProvider,
  type AutocompleteSuggestions
} from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

const commands = [command("skill:review"), command("skill:release"), command("skill:plan")];
const options = () => ({ signal: new AbortController().signal, force: true });

function fixture() {
  const current = new CombinedAutocompleteProvider(commands, process.cwd());
  const provider = createSkillAutocompleteProvider(current, () => commands);

  return { current, provider };
}

describe("skill suggestions", () => {
  it("preserves native fuzzy order and metadata for inline later-line suggestions", async () => {
    const { current, provider } = fixture();
    const opts = options();
    const native = await current.getSuggestions(["/skill:re"], 0, 9, { ...opts, force: false });
    const result = await provider.getSuggestions(["First line", "\tUse /skill:re"], 1, 14, opts);
    expect(result?.items).toEqual(native!.items);
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

it("preserves unrelated command completion, triggers, and file gating", async () => {
  const native = new CombinedAutocompleteProvider([command("model", "extension")], process.cwd());
  const current: AutocompleteProvider = {
    triggerCharacters: ["#"],
    getSuggestions: native.getSuggestions.bind(native),
    applyCompletion: native.applyCompletion.bind(native),
    shouldTriggerFileCompletion: native.shouldTriggerFileCompletion.bind(native)
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const suggestions = (await provider.getSuggestions(["/mo"], 0, 3, {
    ...options(),
    force: false
  }))!;
  expect(
    provider.applyCompletion(["/mo"], 0, 3, suggestions.items[0]!, suggestions.prefix)
  ).toEqual({ lines: ["/model "], cursorLine: 0, cursorCol: 7 });
  expect(provider.triggerCharacters).toEqual(["#"]);
  expect(provider.shouldTriggerFileCompletion!(["/mo"], 0, 3)).toBe(false);
  expect(provider.shouldTriggerFileCompletion!(["Use ./"], 0, 6)).toBe(true);
});

it("does not claim a borrowed item reused by a delegated provider", async () => {
  const item = { value: "skill:review", label: "custom label", description: "native metadata" };
  const native = new CombinedAutocompleteProvider([], process.cwd());
  const current: AutocompleteProvider = {
    getSuggestions: async () => ({ items: [item], prefix: "#issue" }),
    applyCompletion: native.applyCompletion.bind(native)
  };
  const provider = createSkillAutocompleteProvider(current, () => commands);
  const owned = (await provider.getSuggestions(["/skill:re"], 0, 9, options()))!;
  expect(provider.applyCompletion(["/skill:re"], 0, 9, owned.items[0]!, owned.prefix)).toEqual({
    lines: ["/skill:review "],
    cursorLine: 0,
    cursorCol: 14
  });
  const delegated = (await provider.getSuggestions(["#issue"], 0, 6, options()))!;
  expect(provider.applyCompletion(["#issue"], 0, 6, delegated.items[0]!, delegated.prefix)).toEqual(
    { lines: ["skill:review"], cursorLine: 0, cursorCol: 12 }
  );
});

it("discards results aborted before or during a suggestion request", async () => {
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>();
  const current: AutocompleteProvider = {
    getSuggestions: () => pending.promise,
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
  expect(
    await provider.getSuggestions(["/skill:re"], 0, 9, { signal: controller.signal })
  ).toBeNull();
});
