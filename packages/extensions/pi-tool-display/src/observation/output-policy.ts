import type { OutputBufferOptions } from "@pi-mono/libs/output-buffer";
import { joinOutputText, outputOmission } from "@pi-mono/utils/output-text";

export const liveOutputOptions = {
  maxBytes: 1024 * 1024,
  edgeLines: 50,
  lineBytes: 10_280,
  formatOmission: ({ count, unit }) =>
    joinOutputText([
      // Long-line clipping may leave a process style active at the inserted notice.
      ...(unit === "bytes" ? ["\x1b[0m"] : []),
      outputOmission(`… ${count} ${unit} omitted …`)
    ])
} satisfies OutputBufferOptions;
