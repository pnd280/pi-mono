// The `input` hook below is a verbatim copy of T3 Code's skill-chip hook, un-escaped from the
// template string in packages/provider-pi/src/server/mcpExtensionSource.ts at
// https://github.com/pingdotgg/t3code/blob/8b44f42b14c8e273156474a924ccf29680dd7857/packages/provider-pi/src/server/mcpExtensionSource.ts
// (commit 8b44f42b14c8e273156474a924ccf29680dd7857). Only formatting differs.
// T3 Code is MIT licensed: Copyright (c) 2026 T3 Tools Inc.
/* oxlint-disable @stylistic/padding-line-between-statements -- keep T3's statements verbatim */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { stripFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function t3InputHook(pi: ExtensionAPI): void {
  // Keep skill chips in the request. Pi expands only one leading /skill:
  // command, so use its own frontmatter loader for every selected chip here.
  // @ts-expect-error This workspace's exactOptionalPropertyTypes rejects `images: undefined`; Pi accepts it.
  pi.on("input", async (event, ctx) => {
    if (!event.text.includes("$")) return;
    const commands = pi.getCommands().filter((command) => command.source === "skill");
    const nativeSkill = /^\/skill:([^ ]+)(?: |$)/.exec(event.text)?.[1];
    const seen = new Set<string>(nativeSkill === undefined ? [] : [nativeSkill]);
    const blocks: string[] = [];
    for (const match of event.text.matchAll(/(^|\s)\$([^\s]+)(?=\s|$)/g)) {
      const name = match[2];
      if (name === undefined || seen.has(name)) continue;
      const command = commands.find((candidate) => candidate.name === "skill:" + name);
      if (command === undefined) continue;
      seen.add(name);
      const path = command.sourceInfo.path;
      try {
        const body = stripFrontmatter(await NodeFSP.readFile(path, "utf8")).trim();
        blocks.push(
          `<skill name="${name}" location="${path}">\nReferences are relative to ${NodePath.dirname(path)}.\n\n${body}\n</skill>`
        );
      } catch {
        ctx.ui.notify(`Could not load skill ${name} from ${path}.`, "error");
      }
    }
    if (blocks.length === 0) return;
    return {
      action: "transform",
      text: event.text + "\n\n" + blocks.join("\n\n"),
      images: event.images
    };
  });
}
