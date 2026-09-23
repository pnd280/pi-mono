import {
  CombinedAutocompleteProvider,
  Editor,
  ProcessTerminal,
  TuiMainScreen,
  type EditorTheme
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { command } from "./test-fixture.ts";

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
const commands = [command("skill:review"), command("skill:release")];

function editorFixture() {
  const current = new CombinedAutocompleteProvider(commands, process.cwd());
  const tui = new TuiMainScreen(new ProcessTerminal());
  vi.spyOn(tui, "requestRender").mockImplementation(() => {});
  const editor = new Editor(tui, theme);
  const onSubmit = vi.fn();
  editor.onSubmit = onSubmit;
  editor.setAutocompleteProvider(createSkillAutocompleteProvider(current, () => commands));

  return { editor, onSubmit };
}

it("Enter accepts a leading skill completion without submitting", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("/skill:re");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("\r");
  expect(editor.getText()).toMatch(/^\/skill:(review|release) $/u);
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});

it("Tab inserts a single inline skill candidate without submitting", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("Use /skill:review");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.getText()).toBe("Use /skill:review "));
  expect(onSubmit).not.toHaveBeenCalled();
});

it("Tab routes later-line skill completion and accepts a selection at the cursor", async () => {
  const { editor, onSubmit } = editorFixture();
  editor.setText("First\n/skill:reBAD rest");
  for (let index = 0; index < "BAD rest".length; index++) editor.handleInput("\x1b[D");
  editor.handleInput("\t");
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
  editor.handleInput("\t");
  expect(editor.getText()).toMatch(/^First\n\/skill:(review|release)  rest$/u);
  expect(editor.getCursor()).toEqual({ line: 1, col: editor.getLines()[1]!.indexOf("  rest") + 1 });
  expect(onSubmit).not.toHaveBeenCalled();
});
