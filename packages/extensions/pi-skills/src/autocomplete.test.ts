import {
  CombinedAutocompleteProvider,
  Editor,
  ProcessTerminal,
  TuiMainScreen,
  type AutocompleteProvider,
  type EditorTheme
} from "@earendil-works/pi-tui";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

const commands = [command("skill:review"), command("skill:release"), command("skill:plan")];
const options = () => ({ signal: new AbortController().signal, force: true });

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
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true), {
    interval: 1,
    timeout: STEP_TIMEOUT_MS
  });
  editor.handleInput("\r");
  expect(editor.getText()).toMatch(/^\/skill:(review|release) $/u);
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});
