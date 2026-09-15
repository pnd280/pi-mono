import { spawn } from "node:child_process";
import { release } from "node:os";

import { PromptError } from "./model.ts";

export type NativeHelper = { command: string; args: string[] };

export function nativeHelpers(
  platform: string,
  env: NodeJS.ProcessEnv,
  osRelease: string
): NativeHelper[] {
  if (env.SSH_CONNECTION || env.SSH_TTY)
    throw new PromptError(
      "Remote clipboard access is unsupported. Use a local native clipboard session."
    );
  if (platform === "darwin") return [{ command: "pbcopy", args: [] }];
  if (platform !== "linux")
    throw new PromptError("Native clipboard supports Linux, macOS, and WSL only.");

  if (env.WSL_DISTRO_NAME || /microsoft/i.test(osRelease)) {
    // clip.exe can perform code-page conversion. PowerShell decodes stdin explicitly
    // and uses the native clipboard API without adding a newline.
    return [
      {
        command: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-Command",
          "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([Console]::In.ReadToEnd())"
        ]
      }
    ];
  }

  const helpers: NativeHelper[] = [];

  if (env.WAYLAND_DISPLAY)
    helpers.push({ command: "wl-copy", args: ["--type", "text/plain;charset=utf-8"] });
  if (env.DISPLAY)
    helpers.push(
      { command: "xclip", args: ["-selection", "clipboard", "-in"] },
      { command: "xsel", args: ["--clipboard", "--input"] }
    );
  if (!helpers.length)
    throw new PromptError(
      "No local Wayland/X11 clipboard is available. Install wl-copy, xclip, or xsel and use a graphical session."
    );

  return helpers;
}

export function runHelper(helper: NativeHelper, text: string, signal: AbortSignal): Promise<void> {
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

    const abort = () => finish(new PromptError("Clipboard operation cancelled or timed out."));
    signal.addEventListener("abort", abort, { once: true });

    if (signal.aborted) {
      abort();

      return;
    }

    child.once("error", () => finish(new PromptError("Native clipboard helper could not start.")));
    child.stdin.once("error", () =>
      finish(new PromptError("Native clipboard helper did not accept the complete text."))
    );
    child.once("close", (code) =>
      finish(code === 0 ? undefined : new PromptError("Native clipboard helper failed."))
    );
    child.stdin.end(Buffer.from(text, "utf8"));
  });
}

export async function copyNative(
  text: string,
  sessionSignal: AbortSignal,
  options: { helpers?: NativeHelper[]; timeout?: number } = {}
): Promise<void> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), options.timeout ?? 5000);
  const signal = AbortSignal.any([sessionSignal, deadline.signal]);

  try {
    const helpers = options.helpers ?? nativeHelpers(process.platform, process.env, release());

    for (const helper of helpers) {
      signal.throwIfAborted();

      try {
        await runHelper(helper, text, signal);

        return;
      } catch {
        signal.throwIfAborted();
      }
    }

    throw new PromptError(
      "Native clipboard failed. Check pbcopy, wl-copy, xclip/xsel, or WSL PowerShell availability. No terminal clipboard fallback was used."
    );
  } finally {
    clearTimeout(timer);
  }
}
