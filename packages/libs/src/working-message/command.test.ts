import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { hostFixture } from "../validation/interactive-host/index.ts";
import { registerWorkingMessage } from "./index.ts";

function contributors(pi: ExtensionAPI) {
  for (const id of ["a", "b"])
    registerWorkingMessage(pi, { id, label: `Component ${id}`, contributor: "fixture" });
}

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it("/working-message accepts no arguments and saves the global draft selected in the menu, not the project override", async () => {
  const fixture = await hostFixture([contributors]);
  const globalPath = join(fixture.agentDir, "settings.json");
  mkdirSync(fixture.agentDir, { recursive: true });
  mkdirSync(join(fixture.directory, ".pi"));
  writeFileSync(
    join(fixture.directory, ".pi/settings.json"),
    JSON.stringify({ workingMessage: { order: ["b", "a"] } })
  );
  let opening: Promise<void> | undefined;

  try {
    await fixture.bind();
    const runner = fixture.session.extensionRunner;
    const command = runner.getCommand("working-message");
    expect(command).toBeDefined();
    expect(command?.getArgumentCompletions).toBeUndefined();
    const ctx = runner.createCommandContext();
    const notify = vi.spyOn(ctx.ui, "notify");
    const editor = fixture.host.editorContainer.children[0];

    for (const args of ["global", "project", "invalid"]) {
      await command?.handler(args, ctx);
      expect(notify).toHaveBeenLastCalledWith("Usage: /working-message", "error");
      expect(fixture.host.editorContainer.children[0]).toBe(editor);
    }

    opening = command?.handler("", ctx);
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor));
    const menu = fixture.host.editorContainer.children[0]!;
    expect(plain(menu.render(100))).toContain(
      `Settings: ${join(fixture.directory, ".pi/settings.json")}`
    );
    menu.handleInput?.("\t");
    expect(plain(menu.render(100))).toContain(`Settings: ${globalPath}`);
    expect(plain(menu.render(80))).toContain("Scope: global (not set) | project");
    menu.handleInput?.("\x13");
    expect(plain(menu.render(80))).toContain("Project override remains active.");
    expect(plain(menu.render(80))).not.toContain("global (not set)");
    const saved: unknown = JSON.parse(readFileSync(globalPath, "utf8"));
    expect(saved).toMatchObject({ workingMessage: { order: ["a", "b"] } });
    menu.handleInput?.("\x03");
    await opening;
    expect(fixture.host.editorContainer.children[0]).toBe(editor);
  } finally {
    fixture.host.editorContainer.children[0]?.handleInput?.("\x03");
    await fixture.dispose();
    await opening;
  }
});

it("/working-message exposes load warnings and distinguishes a successful save with another invalid scope", async () => {
  const fixture = await hostFixture([contributors]);
  mkdirSync(fixture.agentDir, { recursive: true });
  mkdirSync(join(fixture.directory, ".pi"));
  writeFileSync(join(fixture.agentDir, "settings.json"), "{broken");
  let opening: Promise<void> | undefined;

  try {
    await fixture.bind();
    const runner = fixture.session.extensionRunner;
    const editor = fixture.host.editorContainer.children[0];
    const ctx = runner.createCommandContext();
    opening = runner.getCommand("working-message")?.handler("", ctx);
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor));
    const menu = fixture.host.editorContainer.children[0];
    expect(plain(menu?.render(100) ?? [])).toContain(
      `Settings: ${join(fixture.agentDir, "settings.json")}`
    );
    menu?.handleInput?.("\t");
    expect(plain(menu?.render(100) ?? [])).toContain("Settings warning.");
    const notify = vi.spyOn(ctx.ui, "notify");
    menu?.handleInput?.("\x13");
    expect(plain(menu?.render(100) ?? [])).toContain("Saved and applied.");
    expect(plain(menu?.render(100) ?? [])).toContain("Settings warning.");
    expect(plain(menu?.render(100) ?? [])).not.toContain("Save failed");
    expect(notify).not.toHaveBeenCalled();
    expect(readFileSync(join(fixture.agentDir, "settings.json"), "utf8")).toBe("{broken");
    menu?.handleInput?.("\x03");
    await opening;
  } finally {
    fixture.host.editorContainer.children[0]?.handleInput?.("\x03");
    await fixture.dispose();
    await opening;
  }
});
