import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vite-plus/test";

import { saveCheckpoint } from "./checkpoints.ts";
import { TASK_ENTRY } from "./constants.ts";
import { parseRecord, type TaskRecord } from "./records.ts";
import { Tasks } from "./tasks.ts";

test.each(["competing ancestors", "recipient write failure"])(
  "preserves one recoverable owner through %s",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "subagents-adoption-"));
    const stores: Tasks[] = [];
    vi.stubEnv("PI_CODING_AGENT_DIR", directory);

    try {
      const session = () => {
        const manager = SessionManager.create(directory, directory);
        manager.appendMessage({ role: "user", content: "Ownership fixture", timestamp: 0 });

        return manager;
      };

      const top = session();
      const root = session();
      const middle = session();
      const former = session();
      const child = session();
      const record = async (
        manager: SessionManager,
        owner: SessionManager,
        parent: string | null
      ): Promise<TaskRecord> => ({
        task_id: manager.getSessionId(),
        session_id: manager.getSessionId(),
        owner_session_id: owner.getSessionId(),
        owner_session_file: owner.getSessionFile()!,
        checkpoint: await saveCheckpoint(
          manager.getSessionId(),
          {
            sessionId: manager.getSessionId(),
            cwd: directory,
            entries: manager.getEntries(),
            leafId: manager.getLeafId()
          },
          new AbortController().signal
        ),
        parent_task_id: parent,
        session_file: manager.getSessionFile()!,
        description: "Ownership fixture",
        model: "fixture/model",
        thinking: "off",
        background: false,
        state: "inactive",
        outcome: "completed"
      });

      former.appendCustomEntry(TASK_ENTRY, await record(child, former, former.getSessionId()));
      middle.appendCustomEntry(TASK_ENTRY, await record(former, middle, middle.getSessionId()));
      root.appendCustomEntry(TASK_ENTRY, await record(middle, root, root.getSessionId()));
      top.appendCustomEntry(TASK_ENTRY, await record(root, top, null));

      let fail = mode === "recipient write failure";

      const store = async (manager: SessionManager, depth: number) => {
        const tasks = new Tasks(
          { maxDepth: 4, maxConcurrent: 8, maxQueued: 8 },
          manager.getBranch(),
          {
            depth,
            sessionId: manager.getSessionId(),
            sessionFile: manager.getSessionFile(),
            append(type, data) {
              if (
                manager === root &&
                fail &&
                type === TASK_ENTRY &&
                parseRecord(data)?.task_id === child.getSessionId()
              ) {
                fail = false;
                throw new Error("Fixture recipient write failure");
              }

              manager.appendCustomEntry(type, data);
            }
          }
        );
        stores.push(tasks);
        await tasks.recover();

        return tasks;
      };

      const recipient = await store(root, 1);
      const contender = await store(middle, 2);
      const id = child.getSessionId();
      const release = recipient.claim(id);
      const before = await readFile(former.getSessionFile()!, "utf8");

      if (mode === "competing ancestors") {
        const releaseContender = contender.claim(id);
        const results = await Promise.allSettled([recipient.adopt(id), contender.adopt(id)]);
        releaseContender();
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const loser = results[0].status === "rejected" ? recipient : contender;
        await expect(loser.adopt(id)).rejects.toThrow("Previous supervisor no longer owns");
      } else {
        await expect(recipient.adopt(id)).rejects.toThrow("Fixture recipient write failure");
        // Restart before retrying the missing recipient append. The former owner's receipt
        // must recover the task without allowing that former owner to resume it.
        const restarted = await store(SessionManager.open(root.getSessionFile()!), 1);
        expect(restarted.owned(id).parent_task_id).toBe(root.getSessionId());
        await expect(restarted.adopt(id)).resolves.toBeUndefined();
        const ancestor = await store(top, 0);
        // The ancestor's older checkpoint retains its old history; it gains no later state.
        expect(ancestor.owned(id).parent_task_id).toBe(former.getSessionId());
        await expect(recipient.adopt(id)).resolves.toBeUndefined();
        expect(recipient.owned(id).parent_task_id).toBe(root.getSessionId());
      }

      release();
      expect((await readFile(former.getSessionFile()!, "utf8")).startsWith(before)).toBe(true);
      const formerStore = await store(SessionManager.open(former.getSessionFile()!), 3);
      expect(() => formerStore.owned(id)).toThrow("Task does not belong");
      const ancestor = await store(top, 0);
      // Historical ownership cannot revoke a later recipient's live authority.
      await expect(ancestor.adopt(id)).rejects.toThrow("Previous supervisor no longer owns");

      // A new checkpoint can capture the current recipient and allow a later transfer.
      root.appendCustomEntry(TASK_ENTRY, await record(middle, root, root.getSessionId()));
      top.appendCustomEntry(TASK_ENTRY, await record(root, top, null));
      const currentAncestor = await store(top, 0);
      await currentAncestor.adopt(id);

      // Earlier receipts and checkpoints cannot restore control after onward transfer.
      for (const [manager, depth] of [
        [root, 1],
        [middle, 2]
      ] as const) {
        const restarted = await store(SessionManager.open(manager.getSessionFile()!), depth);
        await expect(restarted.adopt(id)).rejects.toThrow(/does not belong|no longer owns/);
      }
    } finally {
      await Promise.all(stores.map((tasks) => tasks.shutdown()));
      await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  }
);
