import {
  Editor,
  KeybindingsManager,
  setKeybindings,
  TUI_KEYBINDINGS
} from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { assertRestorable } from "../src/host/editor.ts";
import { managerFixture } from "../src/test-fixture.ts";
import { createTestTui } from "./test-terminal.ts";

it("uses expanded native paste text, allows native normalization, and leaves Up/Down history native", async () => {
  setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS));
  const tui = createTestTui();
  const plain = (text: string) => text;
  const editor = new Editor(tui, {
    borderColor: plain,
    selectList: {
      selectedPrefix: plain,
      selectedText: plain,
      description: plain,
      scrollInfo: plain,
      noMatch: plain
    }
  });
  editor.setText("\tline\r\nnext\rend");
  expect(editor.getExpandedText()).toBe("    line\nnext\nend");
  expect(() => assertRestorable("\tline\r\nnext")).not.toThrow();
  expect(() => assertRestorable("bad\x1b[2J")).toThrow("unsafe");
  editor.setText("");
  const paste = Array.from({ length: 30 }, (_, index) => `pasted line ${index}`).join("\n");
  editor.handleInput(`\x1b[200~${paste}\x1b[201~`);
  expect(editor.getText()).not.toBe(paste);
  expect(editor.getExpandedText()).toBe(paste);
  const fixture = managerFixture({
    editor: { read: () => editor.getExpandedText(), write: (text) => editor.setText(text) }
  });
  await fixture.manager.saveEditor();
  expect(editor.getText()).toBe("");
  editor.addToHistory("native previous");
  editor.handleInput("\x1b[A");
  expect(editor.getText()).toBe("native previous");
  editor.handleInput("\x1b[B");
  expect(editor.getText()).toBe("");
  await fixture.manager.dispose();
  tui.stop();
});
