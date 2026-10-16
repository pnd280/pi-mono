import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { renameWithRetry, renameWithRetrySync } from "./index.ts";

vi.mock("node:fs", { spy: true });
vi.mock("node:fs/promises", { spy: true });

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
let directory: string;
beforeEach(async () => {
  directory = await fsp.mkdtemp(join(tmpdir(), "file-rename-"));
});
afterEach(async () => {
  Object.defineProperty(process, "platform", platform);
  vi.resetAllMocks();
  await fsp.rm(directory, { recursive: true, force: true });
});

const variants = [
  {
    rename: () => vi.mocked(fsp.rename),
    run: (source: string, target: string) => renameWithRetry(source, target)
  },
  {
    rename: () => vi.mocked(fs.renameSync),
    run: async (source: string, target: string) => renameWithRetrySync(source, target)
  }
];

it.each([
  { platform: "win32", code: "EPERM", failures: 2, attempts: 3 },
  { platform: "win32", code: "EACCES", failures: 1, attempts: 2 },
  { platform: "win32", code: "EBUSY", failures: Infinity, attempts: 10 },
  { platform: "linux", code: "EPERM", failures: Infinity, attempts: 1 },
  { platform: "win32", code: "EISDIR", failures: Infinity, attempts: 1 }
])(
  "retries $code on $platform for $attempts attempts and keeps the target",
  async ({ platform, code, failures, attempts }) => {
    Object.defineProperty(process, "platform", { value: platform });
    const error = Object.assign(new Error(code), { code });

    for (const variant of variants) {
      const source = join(directory, "source");
      const target = join(directory, "target");
      await fsp.writeFile(source, "new");
      await fsp.writeFile(target, "old");
      const rename = variant.rename();

      // Each injected failure precedes the real rename.
      const fail = () => {
        throw error;
      };

      if (failures === Infinity) rename.mockImplementation(fail);
      else for (let index = 0; index < failures; index++) rename.mockImplementationOnce(fail);

      if (failures < attempts) {
        await variant.run(source, target);
        expect(await fsp.readFile(target, "utf8")).toBe("new");
        await expect(fsp.access(source)).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        await expect(variant.run(source, target)).rejects.toBe(error);
        expect(await fsp.readFile(target, "utf8")).toBe("old");
        expect(await fsp.readFile(source, "utf8")).toBe("new");
      }

      expect(rename).toHaveBeenCalledTimes(attempts);
      rename.mockReset();
    }
  }
);
