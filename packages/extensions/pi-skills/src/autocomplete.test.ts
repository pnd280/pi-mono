import {
  CombinedAutocompleteProvider,
  Editor,
  ProcessTerminal,
  TuiMainScreen,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type EditorTheme
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

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

const plain = (text: string) => text;
const theme: EditorTheme = {
  borderColor: plain,
  selectList: {
    selectedPrefix: plain,
    selectedText: plain,
    description: plain,
    scrollInfo: plain,
    noMatch: plain
  }
};
const editorCommands = [command("skill:review"), command("skill:release")];

function editorFixture() {
  const current = new CombinedAutocompleteProvider(editorCommands, process.cwd());
  const tui = new TuiMainScreen(new ProcessTerminal());
  vi.spyOn(tui, "requestRender").mockImplementation(() => {});
  const editor = new Editor(tui, theme);
  const onSubmit = vi.fn();
  editor.onSubmit = onSubmit;
  editor.setAutocompleteProvider(createSkillAutocompleteProvider(current, () => editorCommands));

  return { editor, onSubmit };
}

it("Enter accepts a leading skill completion without submitting", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("/skill:re");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true), { interval: 1 });
  editor.handleInput("\r");
  expect(editor.getText()).toMatch(/^\/skill:(review|release) $/u);
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});
