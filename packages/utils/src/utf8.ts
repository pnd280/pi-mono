import { StringDecoder } from "node:string_decoder";

import { z } from "zod";

const byteLimitSchema = z.int().nonnegative();

function assertByteLimit(bytes: number): void {
  if (!byteLimitSchema.safeParse(bytes).success)
    throw new RangeError("UTF-8 byte limits must be nonnegative safe integers.");
}

/** Decode a standalone byte window, counting bytes dropped at its incomplete edge.
 * Complete BOMs and literal replacement characters are retained. Invalid UTF-8
 * otherwise follows Node's replacement decoding, not strict validation.
 */
export function decodeUtf8Window(
  buffer: Buffer,
  boundary?: "head" | "tail"
): { text: string; omittedBytes: number } {
  if (boundary === "head") {
    const decoder = new StringDecoder("utf8");
    const text = decoder.write(buffer);
    let end = buffer.length;

    // Only end() output identifies a buffered, incomplete suffix. Invalid interior
    // bytes may expand into replacement characters, so re-encoding text cannot count it.
    if (decoder.end()) {
      while (end > 0 && (buffer.readUInt8(end - 1) & 0xc0) === 0x80) end--;
      end = Math.max(0, end - 1);
    }

    return { text, omittedBytes: buffer.length - end };
  }

  let start = 0;
  if (boundary === "tail")
    while (start < buffer.length && (buffer.readUInt8(start) & 0xc0) === 0x80) start++;

  return { text: buffer.subarray(start).toString("utf8"), omittedBytes: start };
}

export function utf8Prefix(text: string, bytes: number): string {
  assertByteLimit(bytes);
  const buffer = Buffer.from(text);
  let end = Math.min(bytes, buffer.length);
  while (end > 0 && end < buffer.length && (buffer.readUInt8(end) & 0xc0) === 0x80) end--;

  return buffer.subarray(0, end).toString("utf8");
}

export function utf8Suffix(text: string, bytes: number): string {
  assertByteLimit(bytes);
  const buffer = Buffer.from(text);
  let start = Math.max(0, buffer.length - bytes);
  while (start < buffer.length && (buffer.readUInt8(start) & 0xc0) === 0x80) start++;

  return buffer.subarray(start).toString("utf8");
}
