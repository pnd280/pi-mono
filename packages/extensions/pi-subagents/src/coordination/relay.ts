import { randomUUID } from "node:crypto";

import { Capacity } from "../tasks/capacity.ts";
import type { TaskRecord } from "../tasks/records.ts";
import type { ChildMessage, SlotReply } from "./protocol.ts";

export type Reservation = { release(): void };

interface RelayHost {
  /** This supervisor's task ID; a root supervisor has none. */
  self: string | undefined;
  /** Send a message to this process's supervisor. */
  send(message: ChildMessage): void;
  /** Send a slot reply to a direct child. */
  reply(childId: string, message: SlotReply): Promise<void>;
  belongsTo(childId: string, taskId: string): boolean;
  accepts(childId: string, record: TaskRecord): boolean;
  record(record: TaskRecord): void;
}

/** Only adjacent processes exchange messages. The root alone grants whole-tree capacity. */
export class Relay {
  private active = true;
  private capacity: Capacity;
  private routes = new Map<string, { child: string; owner: string }>();
  private grants = new Map<string, { child: string; owner: string; release(): void }>();
  private pending = new Map<
    string,
    { resolve(value: Reservation): void; reject(error: Error): void; dispose(): void }
  >();

  constructor(
    private host: RelayHost,
    private limits: { maxConcurrent: number; maxQueued: number }
  ) {
    this.capacity = new Capacity(limits.maxConcurrent, limits.maxQueued);
  }

  acquire(signal?: AbortSignal): Promise<Reservation> {
    if (!this.active || signal?.aborted)
      return Promise.reject(new Error("Subagent launch cancelled"));
    const owner = this.host.self;
    if (owner === undefined) return this.capacity.acquire(signal).then((release) => ({ release }));
    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(requestId);
        signal?.removeEventListener("abort", abort);
        this.release(requestId, owner);
        reject(new Error("Cancelled by turn abort"));
      };

      this.pending.set(requestId, {
        resolve,
        reject,
        dispose: () => signal?.removeEventListener("abort", abort)
      });
      signal?.addEventListener("abort", abort, { once: true });

      try {
        this.host.send({ kind: "slot-request", request_id: requestId, owner });
      } catch (error) {
        this.pending.get(requestId)?.dispose();
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Cannot request subagent capacity"));
      }
    });
  }

  /** Releases are idempotent; the root also releases a child subtree's slots when it exits. */
  private release(requestId: string, owner: string): void {
    try {
      this.host.send({ kind: "slot-release", request_id: requestId, owner });
    } catch {
      /* The ancestor releases this slot when this process exits. */
    }
  }

  receive(child: string, message: ChildMessage): void {
    if (!this.active) return;

    if (message.kind === "task") {
      if (
        message.record.parent_task_id === null ||
        !this.host.belongsTo(child, message.record.parent_task_id) ||
        !this.host.accepts(child, message.record)
      )
        return;
      this.host.record(message.record);
      if (message.record.state === "inactive") this.exited(message.record.task_id);
    } else if (message.kind === "slot-request") {
      if (!this.host.belongsTo(child, message.owner) || this.routes.has(message.request_id)) return;
      this.routes.set(message.request_id, { child, owner: message.owner });
      if (this.host.self === undefined) this.grant(child, message.request_id, message.owner);
      else this.host.send(message);
    } else if (message.kind === "slot-release") {
      const route = this.routes.get(message.request_id);
      if (route?.child !== child || route.owner !== message.owner) return;
      this.routes.delete(message.request_id);
      this.free(message.request_id, message.owner);
    }
  }

  /** At the root, return a grant; elsewhere, pass the release to the supervisor. */
  private free(requestId: string, owner: string): void {
    if (this.host.self !== undefined) {
      this.release(requestId, owner);

      return;
    }

    this.grants.get(requestId)?.release();
    this.grants.delete(requestId);
  }

  private grant(child: string, requestId: string, owner: string): void {
    const release = this.capacity.tryAcquire();
    if (release) this.grants.set(requestId, { child, owner, release });
    else this.routes.delete(requestId);
    const reply: SlotReply = {
      request_id: requestId,
      owner,
      granted: !!release,
      ...(!release
        ? {
            error: `capacity reached (${this.limits.maxConcurrent} subagents running); do the work yourself`
          }
        : {})
    };
    void this.host.reply(child, reply).catch(() => {
      this.routes.delete(requestId);
      this.free(requestId, owner);
    });
  }

  /** Handle a slot reply from the supervisor: pass it down, or settle this process's request. */
  async reply(message: SlotReply): Promise<void> {
    if (!this.active) throw new Error("Subagent session ended");

    if (message.owner !== this.host.self) {
      const route = this.routes.get(message.request_id);
      if (!route || route.owner !== message.owner) throw new Error("Unknown subagent slot request");
      if (!message.granted) this.routes.delete(message.request_id);

      try {
        await this.host.reply(route.child, message);
      } catch (error) {
        this.routes.delete(message.request_id);
        if (message.granted) this.release(message.request_id, message.owner);
        throw error;
      }

      return;
    }

    const pending = this.pending.get(message.request_id);

    if (!pending) {
      // A late grant for a request that this process no longer waits for.
      if (message.granted) this.release(message.request_id, message.owner);

      return;
    }

    pending.dispose();
    this.pending.delete(message.request_id);

    if (!message.granted) pending.reject(new Error(message.error ?? "Subagent capacity reached"));
    else {
      let released = false;
      pending.resolve({
        release: () => {
          if (released) return;
          released = true;
          this.release(message.request_id, message.owner);
        }
      });
    }
  }

  /** A task's process exited: free the slots that it or its descendants requested. */
  exited(taskId: string): void {
    for (const [id, route] of this.routes) {
      if (route.child !== taskId && !this.host.belongsTo(taskId, route.owner)) continue;
      this.routes.delete(id);
      this.free(id, route.owner);
    }

    for (const [id, grant] of this.grants)
      if (grant.child === taskId || this.host.belongsTo(taskId, grant.owner))
        this.free(id, grant.owner);
  }

  invalidate(): void {
    this.active = false;
    this.capacity.shutdown();

    for (const pending of this.pending.values()) {
      pending.dispose();
      pending.reject(new Error("Subagent session ended"));
    }

    this.pending.clear();
  }

  shutdown(): void {
    this.invalidate();
    for (const grant of this.grants.values()) grant.release();
    this.grants.clear();
    this.routes.clear();
  }
}
