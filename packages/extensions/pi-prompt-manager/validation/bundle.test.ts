import { execFile } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { it } from "vite-plus/test";

import { createWorkspace, launch } from "./workspace.ts";

it.concurrent("keeps feature registration and storage passive in the installed CLI's print mode", async ({
  expect
}) => {
  const directory = await createWorkspace();

  try {
    const extension = join(directory, "verify.ts");
    await writeFile(
      extension,
      `
      export default function(pi) {
        pi.registerCommand('fixture-verify', {handler: async ()=> {
          const passive=!pi.getCommands().some(c=>c.name==='prompts');
          process.stdout.write(JSON.stringify({passive})+'\\n');
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
    expect(stdout + stderr).toContain(JSON.stringify({ passive: true }));
    await expect(access(join(directory, "agent", "pi-prompt-manager"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

it.concurrent("processes large collections through the installed CLI and exits with an idle worker", async ({
  expect
}) => {
  const directory = await createWorkspace();

  try {
    const extension = join(directory, "verify-worker.ts");
    const processing = new URL("../src/storage/processing.ts", import.meta.url).href;
    await writeFile(
      extension,
      `
      import { readCollectionAsync, updateCollectionAsync } from ${JSON.stringify(processing)};
      export default function(pi) {
        pi.registerCommand('fixture-worker', { handler: async () => {
          const options = { collection: 'drafts', cwd: '/fixture', retention: 250 };
          const raw = Buffer.from(JSON.stringify({ version: 1, cwd: options.cwd, entries: [{
            id: '11111111-1111-1111-1111-111111111111', text: 'exact source',
            metadata: 'x'.repeat(2 * 1024 * 1024)
          }] }));
          const snapshot = await readCollectionAsync({ ...options, raw });
          const result = await updateCollectionAsync({ ...options, raw,
            operation: { kind: 'delete', target: snapshot.entries[0] }
          });
          process.stdout.write(JSON.stringify({ processed:
            result.status === 'replace' && result.value.entries.length === 0
          }) + '\\n');
        }});
      }
    `
    );
    const command = await launch(directory);
    const execution = promisify(execFile)(
      command.command,
      [...command.args, "-e", extension, "--print", "/fixture-worker"],
      { ...command.options, timeout: 15000 }
    );
    execution.child.stdin?.end();
    const { stdout, stderr } = await execution;
    expect(stdout + stderr).toContain(JSON.stringify({ processed: true }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
