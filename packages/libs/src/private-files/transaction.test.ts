import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { WriteLifetime } from "./lifetime.ts";
import { PrivateFileTransactions, type PrivateTransactionOptions } from "./transaction.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "private-transaction-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function fixture() {
  const path = join(directory, "data");
  const scope = new WriteLifetime();
  const transactions = new PrivateFileTransactions();
  const options = {
    path: async () => path,
    scope,
    maxReadBytes: 100,
    timeoutMs: 2000,
    update: (raw) => {
      const value = Number(raw?.toString() ?? "0") + 1;

      return { status: "replace", content: String(value), value };
    }
  } satisfies PrivateTransactionOptions<number>;

  return { path, scope, transactions, options };
}

it("serializes fresh reads and leaves unchanged data intact after a failed update", async () => {
  const { path, scope, transactions, options } = fixture();
  // Separate queues, as in separate processes: only the data path's lock orders these reads.
  const writes = await Promise.all([
    transactions.run("data", options),
    new PrivateFileTransactions().run("data", options)
  ]);
  expect(writes).toMatchObject([
    { status: "committed", value: 1 },
    { status: "committed", value: 2 }
  ]);
  expect(
    (
      await transactions.run("data", {
        ...options,
        update() {
          throw new Error("invalid document");
        }
      })
    ).status
  ).toBe("failed");
  expect(
    await transactions.run("data", {
      ...options,
      update: (raw) => ({ status: "unchanged", value: Number(raw?.toString()) })
    })
  ).toMatchObject({ status: "unchanged", value: 2, cleanupErrors: [] });
  expect(await readFile(path, "utf8")).toBe("2");
  expect(await readdir(directory)).toEqual(["data"]);
  await scope.dispose();
});

it("cancels pre-commit work and queued mutations without creating files", async () => {
  const { scope, transactions, options } = fixture();
  const entered = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  const first = transactions.run("data", {
    ...options,
    update: async (raw) => {
      entered.resolve();
      await proceed.promise;

      return options.update(raw);
    }
  });
  await entered.promise;
  const path = vi.fn(options.path);
  const next = transactions.run("data", { ...options, path });
  await scope.dispose();
  proceed.resolve();
  expect((await first).status).toBe("failed");
  expect((await next).status).toBe("failed");
  expect(path).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual([]);
});

it("drains a started commit and its lock cleanup while refusing queued writes", async () => {
  const { path, scope, transactions, options } = fixture();
  const entered = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  const first = transactions.run("data", {
    ...options,
    hooks: {
      beforeRename: async () => {
        entered.resolve();
        await proceed.promise;
      }
    }
  });
  await entered.promise;
  const next = transactions.run("data", options);
  const disposed = vi.fn();
  const finishing = scope.dispose().then(disposed);
  await Promise.resolve();
  expect(disposed).not.toHaveBeenCalled();
  proceed.resolve();
  await finishing;
  expect(await first).toMatchObject({ status: "committed", warnings: [], cleanupErrors: [] });
  expect((await next).status).toBe("failed");
  expect(await readFile(path, "utf8")).toBe("1");
  expect(await readdir(directory)).toEqual(["data"]);
});

it("reports post-commit and lock-release failures without reclassifying a committed write", async () => {
  const { path, scope, transactions, options } = fixture();
  const result = await transactions.run("data", {
    ...options,
    hooks: {
      afterRename: async () => {
        await writeFile(`${path}.lock`, "another owner");
        throw new Error("cleanup fault");
      }
    }
  });
  expect(result).toMatchObject({
    status: "committed",
    value: 1,
    warnings: ["post-commit"],
    cleanupErrors: [expect.any(Error)]
  });
  expect(await readFile(path, "utf8")).toBe("1");
  expect(await readFile(`${path}.lock`, "utf8")).toBe("another owner");
  await scope.dispose();
});
