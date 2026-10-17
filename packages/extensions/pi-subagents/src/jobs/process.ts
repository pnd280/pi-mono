import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { getShellConfig, type BashOperations } from "@earendil-works/pi-coding-agent";

import { forceStop, processOptions, stopRemainingGroup } from "../child/platform.ts";

function startShell(
  shellPath: string | undefined,
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined
) {
  const config = getShellConfig(shellPath);
  const stdin = config.commandTransport === "stdin";
  const options = { cwd, env, ...processOptions(), windowsHide: true };
  const child = stdin
    ? spawn(config.shell, config.args, { ...options, stdio: ["pipe", "pipe", "pipe"] })
    : spawn(config.shell, [...config.args, command], {
        ...options,
        stdio: ["ignore", "pipe", "pipe"]
      });
  // A shell can close stdin before it consumes a stdin-transport command.
  child.stdin?.on("error", () => {});
  if (stdin) child.stdin?.end(command);

  return child;
}

/** Escaped processes can hold inherited pipes. Drain until EOF, idle, or the hard limit. */
async function drainOutput(state: { closed: boolean; lastData: number }): Promise<void> {
  const deadline = Date.now() + 2_000;
  state.lastData = Date.now();
  while (!state.closed && Date.now() < deadline && Date.now() - state.lastData < 100)
    await delay(10);
}

/** Pi supplies the resolved command, cwd and session environment through its public operations. */
export function jobOperations(
  shellPath: string | undefined,
  onData: (data: Buffer) => void,
  onStopError: (error: Error) => void,
  onSpawn: (child: ChildProcess) => () => void
): BashOperations {
  return {
    async exec(command, cwd, { signal, timeout, env }) {
      if (signal?.aborted) throw new Error("aborted");
      const child = startShell(shellPath, command, cwd, env);
      const release = onSpawn(child);
      let forced: Promise<void> | undefined;
      const state = { exited: false, closed: false, timedOut: false, lastData: Date.now() };
      let stopError: Error | undefined;
      const failedStop = Promise.withResolvers<never>();

      const stopFailed = (error: Error) => {
        stopError ??= error;
        onStopError(error);
      };

      const stop = () => {
        forced ??= state.exited
          ? stopRemainingGroup(child, stopFailed)
          : forceStop(child, stopFailed, { reportTaskkillFailure: true });
        if (forced)
          void forced.then(() => {
            if (stopError && !state.exited) failedStop.reject(stopError);
          });
      };

      const output = (data: Buffer) => {
        state.lastData = Date.now();
        onData(data);
      };

      child.stdout.on("data", output);
      child.stderr.on("data", output);
      child.once("close", () => (state.closed = true));
      const exit = new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code: number | null) => {
          state.exited = true;
          // Keep ownership after the shell exits, even when no member holds its output pipes.
          forced ??= stopRemainingGroup(child, stopFailed);
          resolve(code);
        });
      });
      const timer =
        timeout === undefined
          ? undefined
          : setTimeout(() => {
              state.timedOut = true;
              stop();
            }, timeout * 1000);
      if (signal?.aborted) stop();
      else signal?.addEventListener("abort", stop, { once: true });

      try {
        const code = await Promise.race([exit, failedStop.promise]);
        // Timeout and cancellation classify the shell's exit, not the later group cleanup.
        const aborted = signal?.aborted;
        const timeoutAtExit = state.timedOut;
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        await forced;
        release();
        await drainOutput(state);
        if (!state.closed)
          onStopError(new Error("Output can be incomplete: job pipes did not reach EOF"));
        if (aborted) throw new Error("aborted");
        if (timeoutAtExit) throw new Error(`timeout:${timeout}`);

        return {
          exitCode: code ?? (child.signalCode ? 128 + constants.signals[child.signalCode] : 1)
        };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        await forced;
        release();
        if (stopError && !state.exited) child.unref();
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin?.destroy();
      }
    }
  };
}
