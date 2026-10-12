import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";

import { record } from "../values.ts";
import {
  CALL_TYPE,
  parseCallRecord,
  parseWriterRecord,
  WRITER_TYPE,
  type CallRecord,
  type WriterRecord
} from "./metadata.ts";
import { localKey } from "./store.ts";

export type HistorySource = Pick<SessionManager, "getBranch" | "getLeafId" | "getEntry">;

/** Index only the selected ancestry; divergent branches must drop old call associations. */
export class DisplayHistory {
  private messageEntries = new Map<number, Map<string, string>>();
  /** The latest assistant entry on the branch that holds each tool-call ID. */
  private callEntries = new Map<string, string>();
  private writer: WriterRecord | undefined;
  private writers = new Set<string>();
  /** The nearest writer before each call's saved facts or result entry. */
  private callWriters = new Map<string, WriterRecord>();
  /** Validated only when a retained call asks, so compacted-away patches are never parsed. */
  private records = new Map<string, unknown>();
  private parsed = new Map<string, CallRecord | undefined>();
  private indexedLeaf: string | null;

  constructor(private source: HistorySource) {
    for (const entry of source.getBranch()) this.index(entry);
    this.indexedLeaf = source.getLeafId();
  }

  private index(entry: SessionEntry): void {
    if (entry.type === "custom" && entry.customType === WRITER_TYPE) {
      const writer = parseWriterRecord(entry.data);

      if (writer) {
        this.writer = writer;
        this.writers.add(writer.writer);
      }
    }

    if (entry.type === "custom" && entry.customType === CALL_TYPE) {
      const data = record(entry.data);

      if (typeof data.entry === "string" && typeof data.toolCallId === "string") {
        const key = localKey(data.entry, data.toolCallId);
        this.records.set(key, entry.data);
        this.parsed.delete(key);
        if (this.writer) this.callWriters.set(key, this.writer);
      }
    }

    if (entry.type !== "message") return;
    const message = entry.message;

    if (message.role === "toolResult") {
      const source = this.callEntries.get(message.toolCallId);
      if (source && this.writer)
        this.callWriters.set(localKey(source, message.toolCallId), this.writer);
    }

    if (message.role !== "assistant") return;
    const entries = this.messageEntries.get(message.timestamp) ?? new Map<string, string>();

    for (const [index, content] of message.content.entries()) {
      if (content.type !== "toolCall") continue;
      entries.set(JSON.stringify([index, content.id]), entry.id);
      this.callEntries.set(content.id, entry.id);
    }

    this.messageEntries.set(message.timestamp, entries);
  }

  private sync(): void {
    const manager = this.source;
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
      this.callEntries.clear();
      this.writer = undefined;
      this.writers.clear();
      this.callWriters.clear();
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

  hasWriter(writer: string): boolean {
    this.sync();

    return this.writers.has(writer);
  }

  /** The writer whose local file holds the call's details. */
  writerFor(entry: string, toolCallId: string): WriterRecord | undefined {
    this.sync();

    return this.callWriters.get(localKey(entry, toolCallId));
  }

  callRecord(entry: string, toolCallId: string): CallRecord | undefined {
    this.sync();
    const key = localKey(entry, toolCallId);
    if (this.parsed.has(key)) return this.parsed.get(key);
    const parsed = this.records.has(key) ? parseCallRecord(this.records.get(key)) : undefined;
    this.parsed.set(key, parsed);

    return parsed;
  }
}
