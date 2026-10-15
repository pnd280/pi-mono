import { constants } from "node:fs";
import { open } from "node:fs/promises";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";
import { decodeUtf8Window } from "@pi-mono/utils/utf8";

/** Marks a tail that starts after the beginning of the log. */
const EARLIER_OUTPUT = "[Earlier output omitted]";

/**
 * The end of a job's log file, at most `maxBytes` and `maxLines`. It reads only the file's last
 * bytes, never follows a link, and never blocks on a special file.
 */
export async function readLogTail(
  path: string,
  { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES } = {}
): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Job log is not a regular file");
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, stat.size - length);
    const window = buffer.subarray(0, bytesRead);
    const clipped = stat.size > length;
    const text = clipped ? decodeUtf8Window(window, "tail").text : window.toString("utf8");
    const result = truncateTail(text, { maxBytes, maxLines });

    return clipped || result.truncated ? `${EARLIER_OUTPUT}\n${result.content}` : result.content;
  } finally {
    await handle.close();
  }
}
