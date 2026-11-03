import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

/** Starts a child supervisor's stderr line that names a failed process cleanup of its own task. */
const STOP_FAILURE_PREFIX = "pi-subagents: owned-process cleanup failed: ";

/** The longest cleanup failure that one stderr record of a child supervisor gives. */
const STOP_FAILURE_MAX = 4_096;

/** How long a child supervisor waits for stderr to take its forwarded cleanup failures. */
const FORWARD_MS = 1_000;

/** Writes to stderr before the process exits. When no reader remains (EPIPE), nothing reports it. */
function forwardStderr(text: string): Promise<void> {
  // A failed write also emits an error after its callback; without a listener, it ends the process.
  // Other errors keep that default: with no other listener, this one throws them again.
  const onError = (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE" && process.stderr.listenerCount("error") === 1) throw error;
  };

  process.stderr.on("error", onError);

  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, FORWARD_MS);
    // The listener stays until this write ends, also after the timeout, because it can still fail.
    process.stderr.write(text, () => {
      clearTimeout(timer);
      setImmediate(() => process.stderr.off("error", onError));
      resolve();
    });
  });
}

/**
 * Forwards this child supervisor's failed process cleanups to its supervisor through stderr. Each
 * record starts a line, also after other output without a final newline.
 */
export function forwardStopFailures(messages: readonly string[]): Promise<void> {
  return forwardStderr(messages.map((message) => `\n${STOP_FAILURE_PREFIX}${message}\n`).join(""));
}

/**
 * Gives each failed process cleanup that a child supervisor writes to `stream`, one per line. It
 * reads the whole stream, so other output and the bounded stderr excerpt cannot hide them.
 */
export function observeStopFailures(stream: Readable, receive: (message: string) => void): void {
  const decoder = new StringDecoder("utf8");
  // The current line while it can still be a record.
  let line: string | undefined = "";

  const add = (text: string) => {
    if (line === undefined) return;
    line = (line + text).slice(0, STOP_FAILURE_PREFIX.length + STOP_FAILURE_MAX);
    if (!line.startsWith(STOP_FAILURE_PREFIX) && !STOP_FAILURE_PREFIX.startsWith(line))
      line = undefined;
  };

  const end = () => {
    if (line?.startsWith(STOP_FAILURE_PREFIX)) receive(line.slice(STOP_FAILURE_PREFIX.length));
    line = "";
  };

  stream.on("data", (chunk: Buffer) => {
    const [first = "", ...rest] = decoder.write(chunk).split("\n");
    add(first);

    for (const part of rest) {
      end();
      add(part);
    }
  });
  stream.once("close", () => {
    add(decoder.end());
    end();
  });
}
