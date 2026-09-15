import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it } from "vite-plus/test";

import { createWorkspace, launch } from "./workspace.ts";

it("recognizes the bundled custom append contract while keeping feature registration passive in print mode", async () => {
  const directory = await createWorkspace();

  try {
    const adapter = fileURLToPath(new URL("../src/host/custom-append.ts", import.meta.url));
    const extension = join(directory, "verify.ts");
    await writeFile(
      extension,
      `
      import { installCustomAppend } from ${JSON.stringify(adapter)};
      export default function(pi) {
        pi.registerCommand('fixture-verify', {handler: async (_args,ctx)=> {
          let count=0;
          const sm=ctx.sessionManager;
          const original=sm.appendCustomMessageEntry;
          const dispose=installCustomAppend({manager:sm,allowlist:['allow'],capture:()=>count++,now:()=>new Date()});
          sm.appendCustomMessageEntry('allow','fixture text',false);
          dispose?.();
          const restored=sm.appendCustomMessageEntry===original;
          const passive=!pi.getCommands().some(c=>c.name==='prompts');
          process.stdout.write(JSON.stringify({recognized:typeof dispose==='function',count,restored,passive})+'\\n');
        }});
      }
    `
    );
    const command = await launch(directory);
    const execution = promisify(execFile)(
      command.command,
      [...command.args, "-e", extension, "--print", "/fixture-verify"],
      { ...command.options, timeout: 15000 }
    );
    execution.child.stdin?.end();
    const { stdout, stderr } = await execution;
    expect(stdout + stderr).toContain(
      JSON.stringify({ recognized: true, count: 1, restored: true, passive: true })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
