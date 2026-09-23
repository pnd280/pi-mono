import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

export const MAX_SETTINGS_FILE_BYTES = 1024 * 1024;

/**
 * Read a complete regular settings file up to 1 MiB, following symlinks.
 * Missing/unreadable paths throw; callers own their fallback policy. Non-files,
 * oversized files, and reads with a byte count different from the initial size return undefined.
 */
export function readSettingsFile(path: string): string | undefined {
  // A nonblocking open prevents a FIFO masquerading as settings from stalling startup.
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size > MAX_SETTINGS_FILE_BYTES) return undefined;
    const data = Buffer.allocUnsafe(stats.size + 1);
    let length = 0;

    // Read one extra byte to detect growth after the initial stat.
    while (length < data.length) {
      const count = readSync(descriptor, data, length, data.length - length, null);
      if (count === 0) break;
      length += count;
    }

    return length === stats.size ? data.toString("utf8", 0, length) : undefined;
  } finally {
    closeSync(descriptor);
  }
}
