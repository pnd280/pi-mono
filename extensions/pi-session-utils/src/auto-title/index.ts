import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LifecycleParticipant } from "@pi-mono/libs/lifecycle";

import { loadTitleConfig } from "./config.ts";
import { generateTitle } from "./generate.ts";
import { SessionTitle } from "./runtime.ts";

export function registerAutoTitle(
  pi: ExtensionAPI,
  lifecycle: LifecycleParticipant
): (args: string) => Promise<void> {
  let title: SessionTitle | undefined;
  // ctx.signal belongs to the low-level agent loop. Pi can still abort the run after that loop ends,
  // for example while agent_before_settle handlers wait, and reports it only in agent_settled. So an
  // automatic title is saved only after its run settles without an abort.
  let run: { controller: AbortController; settled: PromiseWithResolvers<void> } | undefined;

  pi.on("session_start", (_event, ctx) => {
    title?.dispose();
    run = undefined;
    const config = loadTitleConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    title = new SessionTitle({
      getSessionName: () => pi.getSessionName(),
      setSessionName: (name) => pi.setSessionName(name),
      getBranch: () => ctx.sessionManager.getBranch(),
      generate: (source, signal) =>
        generateTitle({ config, registry: ctx.modelRegistry, source, signal }),
      notify: (message, type) => {
        if (ctx.hasUI) ctx.ui.notify(message, type);
      }
    });
  });
  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "user") return;
    run ??= { controller: new AbortController(), settled: Promise.withResolvers() };
    const { signal } = run.controller;
    void title?.automatic(event.message, {
      signal: ctx.signal ? AbortSignal.any([ctx.signal, signal]) : signal,
      settled: run.settled.promise
    });
  });
  pi.on("agent_settled", (event) => {
    if (event.aborted) run?.controller.abort();
    run?.settled.resolve();
    run = undefined;
  });
  pi.on("session_info_changed", () => title?.nameChanged());
  // Only a completed navigation cancels: a later session_before_tree handler can still cancel it.
  // A title that arrives during navigation is saved like one that arrives just before it: Pi
  // restores the leaf from its own IDs, and the session name is session-wide.
  pi.on("session_tree", () => title?.cancel());
  // A revoke runs before any participant's shutdown handler awaits. Every workspace extension whose
  // shutdown handler awaits is a participant, so no title is saved after shutdown begins unless an
  // extension from outside the workspace awaits first.
  lifecycle.onSessionShutdown(() => title?.dispose());

  return async (args) => {
    await title?.command(args);
  };
}
