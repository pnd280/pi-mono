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
  await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true), { interval: 1 });
  editor.handleInput("\r");
  expect(editor.getText()).toMatch(/^\/skill:(review|release) $/u);
  expect(editor.isShowingAutocomplete()).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});
