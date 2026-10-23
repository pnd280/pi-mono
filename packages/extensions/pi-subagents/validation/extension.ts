import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ResultSource } from "../src/background-result.ts";
import subagents from "../src/index.ts";
import { HOLD_CHANNEL, PENDING_RESULT_CHANNEL } from "./provider.ts";

/** Reports to the latest extension instance; Pi can reuse this module for a later load. */
let report: (() => void) | undefined;
let reportHold: (() => void) | undefined;

// Delivery takes each result through this seam and holds it until Pi can take it. Pi evaluates
// this module once for each fresh module graph, so the wrappers apply once to its sources.
// The wrappers call the real methods with each source as their receiver.
// oxlint-disable-next-line typescript/unbound-method
const subscribe = ResultSource.prototype.subscribe;
// oxlint-disable-next-line typescript/unbound-method
const holdsRun = ResultSource.prototype.holdsRun;

ResultSource.prototype.subscribe = function (this: ResultSource, listener) {
  return subscribe.call(this, (event) => {
    listener(event);
    if (event.kind === "result") report?.();
  });
};

// Delivery asks a source whether it holds the run only while it waits after a final reply.
ResultSource.prototype.holdsRun = function (this: ResultSource) {
  const held = holdsRun.call(this);
  if (held) reportHold?.();

  return held;
};

/**
 * pi-subagents for fixture workspaces: it reports each pending background result, and each wait
 * that a source holds, to the provider.
 */
export default function fixtureSubagents(pi: ExtensionAPI): void {
  report = () => pi.events.emit(PENDING_RESULT_CHANNEL, undefined);
  reportHold = () => pi.events.emit(HOLD_CHANNEL, undefined);
  subagents(pi);
}
