import { StringDecoder } from "node:string_decoder";

/** Decode a standalone byte window, dropping only an incomplete edge character.
 * Complete BOMs and literal replacement characters are retained. Invalid UTF-8
 * otherwise follows Node's replacement decoding, not strict validation.
 */
export function decodeUtf8(buffer: Buffer, boundary?: "head" | "tail"): string {
  let start = 0;
  if (boundary === "tail")
    while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;

  return boundary === "head"
    ? new StringDecoder("utf8").write(buffer)
    : buffer.subarray(start).toString("utf8");
}

export function utf8Prefix(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  let end = Math.min(bytes, buffer.length);
  while (end > 0 && end < buffer.length && (buffer[end]! & 0xc0) === 0x80) end--;

  return buffer.subarray(0, end).toString("utf8");
}

export function utf8Suffix(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  let start = Math.max(0, buffer.length - bytes);
  while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;

  return buffer.subarray(start).toString("utf8");
}
