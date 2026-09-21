import { StringDecoder } from "node:string_decoder";

import {
  joinOutputText,
  type OmissionFormatter,
  type OutputText
} from "@pi-mono/utils/output-text";
import { utf8Prefix, utf8Suffix } from "@pi-mono/utils/utf8";
import { z } from "zod";

const limitsSchema = z.object({
  /** Retain full output up to this many raw input bytes. */
  maxBytes: z.int().positive(),
  /** Completed lines kept at each edge once full output exceeds maxBytes. */
  edgeLines: z.int().positive(),
  /** Bytes kept per line, divided between its head and tail. */
  lineBytes: z.int().positive()
});

export type OutputBufferOptions = z.infer<typeof limitsSchema> & {
  formatOmission: OmissionFormatter;
};

class RetainedLine {
  head = "";
  tail = "";
  bytes = 0;
  private spilled = false;
  constructor(private readonly options: OutputBufferOptions) {}
  append(text: string): void {
    this.bytes += Buffer.byteLength(text);
    // Once text spills into the tail, the head must remain a contiguous prefix.
    // A later narrow character cannot fill space left by a multibyte boundary.
    const available = this.spilled
      ? 0
      : Math.ceil(this.options.lineBytes / 2) - Buffer.byteLength(this.head);
    const head = available > 0 ? utf8Prefix(text, available) : "";
    this.spilled ||= head.length < text.length;
    this.head += head;
    this.tail = utf8Suffix(
      this.tail + text.slice(head.length),
      Math.floor(this.options.lineBytes / 2)
    );
  }
  text(): OutputText {
    const omitted = this.bytes - Buffer.byteLength(this.head) - Buffer.byteLength(this.tail);

    return omitted > 0
      ? joinOutputText([
          this.head,
          this.options.formatOmission({ count: omitted, unit: "bytes" }),
          this.tail
        ])
      : { text: this.head + this.tail };
  }
}

/** Append actual byte chunks, never replacement snapshots. One instance per stream. */
export class OutputBuffer {
  private decoder = new StringDecoder("utf8");
  private full: string | undefined = "";
  private head: OutputText[] = [];
  private tail: OutputText[] = [];
  private line: RetainedLine;
  private completed = 0;
  private finished = false;
  private totalBytes = 0;
  constructor(private readonly options: OutputBufferOptions) {
    if (!limitsSchema.safeParse(options).success)
      throw new RangeError("Output buffer limits must be positive safe integers.");
    this.options = { ...options };
    this.line = new RetainedLine(this.options);
  }
  append(buffer: Buffer): void {
    if (this.finished) return;
    this.totalBytes += buffer.length;
    if (this.totalBytes > this.options.maxBytes) this.full = undefined;
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

    for (const [index, fragment] of fragments.entries()) {
      this.line.append(fragment);
      if (index === fragments.length - 1) break;
      const line = this.line.text();
      line.text = line.text.replace(/\r$/, "");

      if (this.head.length < this.options.edgeLines) this.head.push(line);
      else {
        this.tail.push(line);
        if (this.tail.length > this.options.edgeLines) this.tail.shift();
      }

      this.completed++;
      this.line = new RetainedLine(this.options);
    }
  }
  snapshot(): OutputText {
    if (this.full !== undefined) return { text: this.full };
    const omitted = this.completed - this.head.length - this.tail.length;

    return joinOutputText(
      [
        ...this.head,
        ...(omitted ? [this.options.formatOmission({ count: omitted, unit: "lines" })] : []),
        ...this.tail,
        ...(this.line.bytes > 0 ? [this.line.text()] : [])
      ],
      "\n"
    );
  }
}
