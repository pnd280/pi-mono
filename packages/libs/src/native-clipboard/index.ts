import { spawn } from "node:child_process";
import { release } from "node:os";

import { z } from "zod";

import { nativeHelpers, NativeClipboardError, type NativeHelper } from "./helpers.ts";

export { NativeClipboardError, type NativeHelper } from "./helpers.ts";

const timeoutSchema = z.int().nonnegative().max(2_147_483_647);

function runHelper(helper: NativeHelper, text: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();

  return new Promise((resolve, reject) => {
    const child = spawn(helper.command, helper.args, { stdio: ["pipe", "ignore", "ignore"] });
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) {
        child.kill("SIGKILL");
        reject(error);
      } else resolve();
    };

    const abort = () =>
      finish(new NativeClipboardError("Clipboard operation cancelled or timed out."));
    signal.addEventListener("abort", abort, { once: true });

    if (signal.aborted) {
      abort();

      return;
    }

    child.once("error", () =>
      finish(new NativeClipboardError("Native clipboard helper could not start."))
    );
    child.stdin.once("error", () =>
      finish(new NativeClipboardError("Native clipboard helper did not accept the complete text."))
    );
    child.once("close", (code) =>
      finish(code === 0 ? undefined : new NativeClipboardError("Native clipboard helper failed."))
    );
    child.stdin.end(Buffer.from(text, "utf8"));
  });
}

/**
 * Replace the native clipboard with exact UTF-8 text, without an OSC 52 fallback.
 * The timeout is in milliseconds and covers all helper attempts (default: 5,000);
 * expiry throws NativeClipboardError. Cancellation can throw the signal's reason;
 * only NativeClipboardError messages are safe for user-facing diagnostics.
 */
export async function copyNative(
  text: string,
  signal: AbortSignal,
  options: { helpers?: NativeHelper[]; timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  if (!timeoutSchema.safeParse(timeout).success)
    throw new RangeError("Clipboard timeout must be a supported nonnegative timer duration.");
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new NativeClipboardError("Native clipboard helper timed out.")),
    timeout
  );
  const operationSignal = AbortSignal.any([signal, deadline.signal]);

  try {
    const helpers = options.helpers ?? nativeHelpers(process.platform, process.env, release());

    for (const helper of helpers) {
      operationSignal.throwIfAborted();

      try {
        await runHelper(helper, text, operationSignal);

        return;
      } catch {
        operationSignal.throwIfAborted();
      }
    }

    throw new NativeClipboardError(
      "Native clipboard failed. Check pbcopy, wl-copy, xclip/xsel, or WSL PowerShell availability. No terminal clipboard fallback was used."
    );
  } finally {
    clearTimeout(timer);
  }
}
