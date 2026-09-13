import { StringDecoder } from "node:string_decoder";

import { joinOutputText, outputOmission, type OutputText } from "./output-text.ts";

export const LIVE_OUTPUT_BYTES = 1024 * 1024;

export const LIVE_OUTPUT_LINES = 50;

export const LIVE_LINE_BYTES = 10_280;

function prefix(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  let end = Math.min(bytes, buffer.length);
  while (end > 0 && end < buffer.length && (buffer[end]! & 0xc0) === 0x80) end--;

  return buffer.subarray(0, end).toString("utf8");
}

function suffix(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  let start = Math.max(0, buffer.length - bytes);
  while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;

  return buffer.subarray(start).toString("utf8");
}

class RetainedLine {
  head = "";
  tail = "";
  bytes = 0;
  append(text: string): void {
    this.bytes += Buffer.byteLength(text);
    // Once text spills into the tail, the head must remain a contiguous prefix.
    // A later narrow character cannot fill space left by a multibyte boundary.
    const available = this.tail ? 0 : LIVE_LINE_BYTES / 2 - Buffer.byteLength(this.head);
    const head = available > 0 ? prefix(text, available) : "";
    this.head += head;
    this.tail = suffix(this.tail + text.slice(head.length), LIVE_LINE_BYTES / 2);
  }
  text(): OutputText {
    const omitted = this.bytes - Buffer.byteLength(this.head) - Buffer.byteLength(this.tail);

    return omitted > 0
      ? joinOutputText([
          this.head,
          "\x1b[0m",
          outputOmission(`… ${omitted} bytes omitted …`),
          this.tail
        ])
      : { text: this.head + this.tail };
  }
}

/** Observes real chunks only, never Pi replacement snapshots. */
export class OutputBuffer {
  private decoder = new StringDecoder("utf8");
  private full: string | undefined = "";
  private head: OutputText[] = [];
  private tail: OutputText[] = [];
  private line = new RetainedLine();
  private completed = 0;
  private finished = false;
  private totalBytes = 0;
  append(buffer: Buffer): void {
    if (this.finished) return;
    this.totalBytes += buffer.length;
    if (this.totalBytes > LIVE_OUTPUT_BYTES) this.full = undefined;
    for (let offset = 0; offset < buffer.length; offset += 16 * 1024)
      this.ingest(this.decoder.write(buffer.subarray(offset, offset + 16 * 1024)));
  }
  finish(): void {
    if (!this.finished) {
      this.ingest(this.decoder.end());
      this.finished = true;
    }
  }
  private ingest(text: string): void {
    if (this.full !== undefined) this.full += text;
    const fragments = text.split("\n");

    for (let index = 0; index < fragments.length; index++) {
      this.line.append(fragments[index]!);
      if (index === fragments.length - 1) break;
      const line = this.line.text();
      line.text = line.text.replace(/\r$/, "");

      if (this.head.length < LIVE_OUTPUT_LINES) this.head.push(line);
      else {
        this.tail.push(line);
        if (this.tail.length > LIVE_OUTPUT_LINES) this.tail.shift();
      }

      this.completed++;
      this.line = new RetainedLine();
    }
  }
  snapshot(): OutputText {
    if (this.full !== undefined) return { text: this.full };
    const omitted = this.completed - this.head.length - this.tail.length;

    return joinOutputText(
      [
        ...this.head,
        ...(omitted ? [outputOmission(`… ${omitted} lines omitted …`)] : []),
        ...this.tail,
        ...(this.line.bytes > 0 ? [this.line.text()] : [])
      ],
      "\n"
    );
  }
}
