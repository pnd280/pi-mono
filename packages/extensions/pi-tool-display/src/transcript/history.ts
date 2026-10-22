import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";

import { record } from "../values.ts";
import { CALL_TYPE, parseCallRecord, type CallRecord } from "./metadata.ts";

/** Identifies a call by its assistant entry and tool-call ID. */
export function callKey(entry: string, toolCallId: string): string {
  return JSON.stringify([entry, toolCallId]);
}

export type HistorySource = Pick<SessionManager, "getBranch" | "getLeafId" | "getEntry">;

/** Index only the selected ancestry; divergent branches must drop old call associations. */
export class DisplayHistory {
  private messageEntries = new Map<number, Map<string, string>>();
  /** Validated only when a retained call asks, so compacted-away patches are never parsed. */
  private records = new Map<string, unknown>();
  private parsed = new Map<string, CallRecord | undefined>();
  /** Undefined until first use: the TUI replaces the session-start display before it reads history. */
  private indexedLeaf: string | null | undefined;

  constructor(private source: HistorySource) {}

  private index(entry: SessionEntry): void {
    if (entry.type === "custom" && entry.customType === CALL_TYPE) {
      const data = record(entry.data);

      if (typeof data.entry === "string" && typeof data.toolCallId === "string") {
        const key = callKey(data.entry, data.toolCallId);
        this.records.set(key, entry.data);
        this.parsed.delete(key);
      }
    }

    if (entry.type !== "message") return;
    const message = entry.message;
    if (message.role !== "assistant") return;
    const entries = this.messageEntries.get(message.timestamp) ?? new Map<string, string>();

    for (const [index, content] of message.content.entries()) {
      if (content.type !== "toolCall") continue;
      entries.set(JSON.stringify([index, content.id]), entry.id);
    }

    this.messageEntries.set(message.timestamp, entries);
  }

  private sync(): void {
    const manager = this.source;

    if (this.indexedLeaf === undefined) {
      for (const entry of manager.getBranch()) this.index(entry);
      this.indexedLeaf = manager.getLeafId();

      return;
    }

    const leaf = manager.getLeafId();
    if (leaf === this.indexedLeaf) return;
    const added: SessionEntry[] = [];
    let id = leaf;

    while (id && id !== this.indexedLeaf) {
      const entry = manager.getEntry(id);
      if (!entry) break;
      added.push(entry);
      id = entry.parentId;
    }

    // Usually only the newly appended entries are visited. A divergent ancestry
    // must drop stale associations even before the host reconstructs.
    if (id !== this.indexedLeaf) {
      this.messageEntries.clear();
      this.records.clear();
      this.parsed.clear();
    }

    for (const entry of added.reverse()) this.index(entry);
    this.indexedLeaf = leaf;
  }

  messageEntry(timestamp: number, contentIndex: number, toolCallId: string): string | undefined {
    this.sync();

    return this.messageEntries.get(timestamp)?.get(JSON.stringify([contentIndex, toolCallId]));
  }

  callRecord(entry: string, toolCallId: string): CallRecord | undefined {
    this.sync();
    const key = callKey(entry, toolCallId);
    if (this.parsed.has(key)) return this.parsed.get(key);
    const parsed = this.records.has(key) ? parseCallRecord(this.records.get(key)) : undefined;
    this.parsed.set(key, parsed);

    return parsed;
  }
}
