import {
  CombinedAutocompleteProvider,
  type AutocompleteProvider,
  type AutocompleteSuggestions
} from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

const commands = [command("skill:review"), command("skill:release"), command("skill:plan")];
const options = () => ({ signal: new AbortController().signal, force: true });

it("reads membership at request time", async () => {
  let catalog = commands;
  const current = new CombinedAutocompleteProvider(commands, process.cwd());
  const provider = createSkillAutocompleteProvider(current, () => catalog);
  expect(await provider.getSuggestions(["/skill:re"], 0, 9, options())).not.toBeNull();
  catalog = [];
  expect(await provider.getSuggestions(["/skill:plan"], 0, 11, options())).toBeNull();
});

it("reads the current catalog after native asynchronous suggestions resolve", async () => {
  const pending = Promise.withResolvers<AutocompleteSuggestions | null>();
  let catalog: typeof commands = [];
  const current: AutocompleteProvider = {
    getSuggestions: () => pending.promise,
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })
  };
  const provider = createSkillAutocompleteProvider(current, () => catalog);
  const result = provider.getSuggestions(["/skill:re"], 0, 9, options());
  catalog = commands;
  pending.resolve({
    items: [{ value: "skill:review", label: "skill:review" }],
    prefix: "/skill:re"
  });
  expect(await result).toEqual({
    items: [{ value: "skill:review", label: "skill:review" }],
    prefix: "skill:re"
  });
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
