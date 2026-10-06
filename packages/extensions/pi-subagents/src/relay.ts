import { randomUUID } from "node:crypto";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { Capacity } from "./capacity.ts";
import { RECORD_MAX_BYTES, RELAY_ENTRY, TASK_ENTRY } from "./constants.ts";
import { parseRecord, taskRecordSchema, type TaskRecord } from "./records.ts";

const id = z.string().min(1).max(1024);
const request = z.object({ request_id: id, owner_session_id: id });
const relaySchema = z.discriminatedUnion("kind", [
  request.extend({ kind: z.literal("slot-request") }),
  request.extend({ kind: z.literal("slot-release") }),
  request.extend({
    kind: z.literal("slot-reply"),
    granted: z.boolean(),
    error: z.string().max(4096).optional()
  }),
  z.object({ kind: z.literal("task"), record: taskRecordSchema }),
  z.object({ kind: z.literal("session-changed"), task_id: id, revision: z.int().nonnegative() })
]);

export type RelayMessage = z.infer<typeof relaySchema>;

export type Reservation = { release(): void; requestId?: string };

export function parseRelay(value: unknown): RelayMessage | undefined {
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > RECORD_MAX_BYTES + 4096) return;

    return relaySchema.safeParse(value).data;
  } catch {
    return;
  }
}

interface RelayHost {
  sessionId: string;
  depth: number;
  maxConcurrent: number;
  capacity: Capacity;
  append(message: RelayMessage): void;
  forward(childId: string, message: RelayMessage): Promise<void>;
  belongsTo(childId: string, taskId: string): boolean;
  accepts(childId: string, record: TaskRecord): boolean;
  record(record: TaskRecord): void;
  changed(taskId: string): void;
}

function relayEntry(entry: SessionEntry): RelayMessage | undefined {
  if (entry.type !== "custom") return;
  if (entry.customType === RELAY_ENTRY) return parseRelay(entry.data);
  const record = entry.customType === TASK_ENTRY ? parseRecord(entry.data) : undefined;

  return record ? { kind: "task", record } : undefined;
}

/** Only adjacent processes exchange messages. The root alone grants whole-tree capacity. */
export class Relay {
  private active = true;
  private routes = new Map<string, { child: string; owner: string }>();
  private grants = new Map<string, { child: string; owner: string; release(): void }>();
  private pending = new Map<
    string,
    { resolve(value: Reservation): void; reject(error: Error): void; dispose(): void }
  >();

  constructor(private host: RelayHost) {}

  acquire(signal?: AbortSignal): Promise<Reservation> {
    if (!this.active || signal?.aborted)
      return Promise.reject(new Error("Subagent launch cancelled"));
    if (this.host.depth === 0)
      return this.host.capacity.acquire(signal).then((release) => ({ release }));
    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const release = () =>
        this.host.append({
          kind: "slot-release",
          request_id: requestId,
          owner_session_id: this.host.sessionId
        });

      const abort = () => {
        this.pending.delete(requestId);
        signal?.removeEventListener("abort", abort);

        try {
          release();
        } catch {
          /* Ancestor exit cleanup also releases pending grants. */
        }

        reject(new Error("Cancelled by turn abort"));
      };

      this.pending.set(requestId, {
        resolve,
        reject,
        dispose: () => signal?.removeEventListener("abort", abort)
      });
      signal?.addEventListener("abort", abort, { once: true });

      try {
        this.host.append({
          kind: "slot-request",
          request_id: requestId,
          owner_session_id: this.host.sessionId
        });
      } catch (error) {
        this.pending.get(requestId)?.dispose();
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Cannot request subagent capacity"));
      }
    });
  }

  receive(child: string, entry: SessionEntry): void {
    if (!this.active) return;
    const message = relayEntry(entry);
    if (!message) return;
    if (message.kind === "task") {
      if (
        message.record.parent_task_id === null ||
        !this.host.belongsTo(child, message.record.parent_task_id) ||
        !this.host.accepts(child, message.record)
      )
        return;
      this.host.record(message.record);

      if (message.record.state === "inactive") {
        this.release(message.record.slot_request_id);
        this.exited(message.record.task_id);
      }
    } else if (message.kind === "session-changed") {
      if (!this.host.belongsTo(child, message.task_id)) return;
      this.host.changed(message.task_id);
    } else if (message.kind === "slot-request") {
      if (
        !this.host.belongsTo(child, message.owner_session_id) ||
        this.routes.has(message.request_id)
      )
        return;
      this.routes.set(message.request_id, { child, owner: message.owner_session_id });

      if (this.host.depth === 0) {
        this.grant(child, message);

        return;
      }
    } else if (message.kind === "slot-release") {
      const route = this.routes.get(message.request_id);
      if (route?.child !== child || route.owner !== message.owner_session_id) return;
      this.release(message.request_id);
      this.routes.delete(message.request_id);
    } else return;
    if (this.host.depth > 0 || message.kind === "task") this.host.append(message);
  }

  private grant(child: string, message: Extract<RelayMessage, { kind: "slot-request" }>): void {
    const release = this.host.capacity.tryAcquire();
    if (release)
      this.grants.set(message.request_id, { child, owner: message.owner_session_id, release });
    const reply: RelayMessage = {
      ...message,
      kind: "slot-reply",
      granted: !!release,
      ...(!release
        ? {
            error: `capacity reached (${this.host.maxConcurrent} subagents running); do the work yourself`
          }
        : {})
    };
    void this.host.forward(child, reply).catch(() => this.release(message.request_id));
  }

  async reply(message: RelayMessage): Promise<void> {
    if (!this.active || message.kind !== "slot-reply")
      throw new Error("Invalid subagent relay reply");

    if (message.owner_session_id !== this.host.sessionId) {
      const route = this.routes.get(message.request_id);
      if (!route || route.owner !== message.owner_session_id)
        throw new Error("Unknown subagent relay request");
      await this.host.forward(route.child, message);

      return;
    }

    const pending = this.pending.get(message.request_id);
    if (!pending) return;
    pending.dispose();
    this.pending.delete(message.request_id);

    if (!message.granted) pending.reject(new Error(message.error ?? "Subagent capacity reached"));
    else {
      let released = false;
      pending.resolve({
        requestId: message.request_id,
        release: () => {
          if (released) return;
          released = true;

          try {
            this.host.append({
              kind: "slot-release",
              request_id: message.request_id,
              owner_session_id: message.owner_session_id
            });
          } catch {
            /* The ancestor also releases this reservation from the exit record. */
          }
        }
      });
    }
  }

  private release(id: string | undefined): void {
    if (id === undefined) return;
    this.grants.get(id)?.release();
    this.grants.delete(id);
  }

  exited(taskId: string): void {
    for (const [id, grant] of this.grants)
      if (grant.child === taskId || this.host.belongsTo(taskId, grant.owner)) this.release(id);
    for (const [id, route] of this.routes)
      if (route.child === taskId || this.host.belongsTo(taskId, route.owner))
        this.routes.delete(id);
  }

  invalidate(): void {
    this.active = false;

    for (const pending of this.pending.values()) {
      pending.dispose();
      pending.reject(new Error("Subagent session ended"));
    }

    this.pending.clear();
  }

  shutdown(): void {
    this.invalidate();
    for (const id of this.grants.keys()) this.release(id);
    this.routes.clear();
  }
}
