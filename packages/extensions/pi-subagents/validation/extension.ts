import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ResultSource } from "../src/background-result.ts";
import subagents from "../src/index.ts";
import { PENDING_RESULT_CHANNEL } from "./provider.ts";

/** Reports to the latest extension instance; Pi can reuse this module for a later load. */
let report: (() => void) | undefined;

// Delivery takes each result through this seam and holds it until Pi can take it. Pi evaluates
// this module once for each fresh module graph, so the wrapper applies once to its sources.
// The wrapper calls the real method with each source as its receiver.
// oxlint-disable-next-line typescript/unbound-method
const subscribe = ResultSource.prototype.subscribe;

ResultSource.prototype.subscribe = function (this: ResultSource, listener) {
  return subscribe.call(this, (event) => {
    listener(event);
    if (event.kind === "result") report?.();
  });
};

/** pi-subagents for fixture workspaces: it reports each pending background result to the provider. */
export default function fixtureSubagents(pi: ExtensionAPI): void {
  report = () => pi.events.emit(PENDING_RESULT_CHANNEL, undefined);
  subagents(pi);
}
