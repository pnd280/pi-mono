import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";
import { decodeUtf8Window } from "@pi-mono/utils/utf8";

/** Marks a tail that starts after the beginning of the log. */
const EARLIER_OUTPUT = "[Earlier output omitted]";

/** A byte-bounded output window, with no partial leading UTF-8 character. */
export function formatLogTail(
  window: Buffer,
  clipped: boolean,
  { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES } = {}
): string {
  const text = clipped ? decodeUtf8Window(window, "tail").text : window.toString("utf8");
  const result = truncateTail(text, { maxBytes, maxLines });

  return clipped || result.truncated ? `${EARLIER_OUTPUT}\n${result.content}` : result.content;
}

/**
 * The end of a job's log file, at most `maxBytes` and `maxLines`. It reads only the file's last
 * bytes, never follows a link, and never blocks on a special file. On Windows, the open can follow
 * a link that replaced the path after `lstat`, but only the same regular file is read.
 */
export async function readLogTail(
  path: string,
  { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES } = {}
): Promise<string> {
  // Windows has no O_NOFOLLOW or O_NONBLOCK, so the opened file must also be the regular file that
  // lstat found. Big integers keep 64-bit NTFS file IDs exact.
  const entry = await lstat(path, { bigint: true });
  if (!entry.isFile()) throw new Error("Job log is not a regular file");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino)
      throw new Error("Job log changed while it was opened");
    const size = Number(stat.size);
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    const window = buffer.subarray(0, bytesRead);
    const clipped = size > length;
    const text = formatLogTail(window, clipped, { maxBytes, maxLines });
    // The viewer's smaller window must retain the disk omission count from the file's header.
    const header = Buffer.alloc(Math.min(size, 128));
    const head = await handle.read(header, 0, header.length, 0);
    const marker = /^\[Earlier output omitted: \d+ bytes\]\n/.exec(
      header.subarray(0, head.bytesRead).toString("utf8")
    )?.[0];

    return marker && !text.startsWith(marker) ? `${marker}${text}` : text;
  } finally {
    await handle.close();
  }
}
