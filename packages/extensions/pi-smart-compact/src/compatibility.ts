import { createHash } from "node:crypto";

import type { Api, Model } from "@earendil-works/pi-ai";
import {
  compact,
  VERSION,
  type AgentSession,
  type SessionBeforeCompactEvent
} from "@earendil-works/pi-coding-agent";

// Pi does not export its virtual-model predicate from the public entry point.
export const virtualModelApi = "pi-virtual";

export type ContextSnapshot = { messages: AgentSession["agent"]["state"]["messages"] };

type CompactArgs = Parameters<typeof compact>;

export type DefaultCompaction = (
  preparation: CompactArgs[0],
  model: Model<Api>,
  instructions: CompactArgs[4],
  signal: AbortSignal,
  reason: SessionBeforeCompactEvent["reason"]
) => ReturnType<typeof compact>;

export type NativeSession = Pick<
  AgentSession,
  | "agent"
  | "sessionManager"
  | "settingsManager"
  | "modelRuntime"
  | "model"
  | "thinkingLevel"
  | "subscribe"
  | "extensionRunner"
> & {
  _appendCustomMessage(
    message: Extract<ContextSnapshot["messages"][number], { role: "custom" }>
  ): void;
  _agentRunAbortRequested: boolean;
  _autoCompactionAbortController: AbortController | undefined;
  _compactionAbortController: AbortController | undefined;
  _runDefaultCompaction: DefaultCompaction;
  // The inspected runtime forwards manual unchanged, despite its narrower declaration.
  _runAutoCompaction(
    reason: SessionBeforeCompactEvent["reason"],
    willRetry: boolean
  ): Promise<boolean>;
};

export type Prepare = (this: NativeSession, context: ContextSnapshot) => Promise<ContextSnapshot>;

export type AutoCompaction = NativeSession["_runAutoCompaction"];

export type ManualCompaction = AgentSession["compact"];

// Reviewed Pi 1.2.0 API modules and installed bundled CLI, respectively. Never
// learn fingerprints from the running host: an unknown implementation must fail closed.
// Keep .agents/skills/pi-update/scripts/fingerprints.ts in sync with these methods.
const fingerprints = [
  {
    _compactBeforeNextAssistantResponse:
      "aaffb7a932c8ec50b67bb2f42d94d2295d37b431850fe4a9dbf2c3299f6318ca",
    _runAutoCompaction: "f07bf873ed393f9345176b24ad80e21c123220df5bf60c0aecbf7e406ccbdf35",
    _runDefaultCompaction: "97f694b93ba4c9aa53b9026a24e3177c4958fce2f55a48bd3b92d0b1dcff170c",
    _appendCustomMessage: "8611e9601816d650052ec466bd47ea61705c5fcb0f4e9a1cf462a0136afc4f0f",
    compact: "072f2b6ebff7b56fa5eef0f4e9614bd66fb48e7c61a673adfa77c4f89f9df433",
    manualCompact: "eca2d26b71753ef8f3713f18e8d29ee3af99fc797bfd3c6df0ba0b4ac4b9f8ff"
  },
  {
    _compactBeforeNextAssistantResponse:
      "cb734ece36840ccb1a02c63471ccd1bd8eb893c195329da7a73053f012212a7e",
    _runAutoCompaction: "c079a7e16d747f8429eb7de3c709a730630367012a2eadeff036a1ae03a15d9e",
    _runDefaultCompaction: "be1bfc56c9becc10cfd7a878b3592199c70119776f1978eca5f0aafb4da7ccd7",
    _appendCustomMessage: "7962902b977b66315b1bf64b4c695322117728bf9701116b46f59848eebcb296",
    compact: "0fced1a8aa5b49e13c692801b918b771ac807f11db95bd342d69f0e005ab89cf",
    manualCompact: "88bcbdb42742d6dc8da5b29c2e62928fd9215986741d4c80b00cd90fe596ca37"
  }
];

export function assertCompatible(
  prototype: object,
  prepare: unknown,
  summarize: unknown,
  automatic: unknown,
  manual: unknown
): void {
  const actual: Record<string, unknown> = {
    _compactBeforeNextAssistantResponse: prepare,
    _runAutoCompaction: automatic,
    _runDefaultCompaction: summarize,
    _appendCustomMessage: Reflect.get(prototype, "_appendCustomMessage"),
    compact,
    manualCompact: manual
  };
  const inspected = fingerprints.some((expected) =>
    Object.entries(expected).every(([key, hash]) => {
      const method = actual[key];

      return (
        typeof method === "function" &&
        createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex") === hash
      );
    })
  );

  if (VERSION !== "1.2.0" || !inspected) {
    throw new Error(
      "pi-smart-compact requires the inspected Pi 1.2.0 compaction implementation; unsupported version or conflicting runtime patch."
    );
  }
}
