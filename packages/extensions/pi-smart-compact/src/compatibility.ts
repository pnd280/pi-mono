import { createHash } from "node:crypto";

import type { Api, Model } from "@earendil-works/pi-ai";
import {
  compact,
  VERSION,
  type AgentSession,
  type ExtensionRunner,
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
> & {
  _appendCustomMessage(
    message: Extract<ContextSnapshot["messages"][number], { role: "custom" }>
  ): void;
  _agentRunAbortRequested: boolean;
  _autoCompactionAbortController: AbortController | undefined;
  _compactionAbortController: AbortController | undefined;
  _extensionRunner: ExtensionRunner;
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

// Reviewed Pi 0.99.1 API modules and installed bundled CLI, respectively. Never
// learn fingerprints from the running host: an unknown implementation must fail closed.
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
    _runAutoCompaction: "89470ac522a561cd5261b1b62e73a4169899cb5e5d9a0a61ac0dcc677d0dc6fa",
    _runDefaultCompaction: "21e5a890fc3d857b0d802ca680e3109c16ff50b94457370640d4f1d7ce9ea8c3",
    _appendCustomMessage: "7962902b977b66315b1bf64b4c695322117728bf9701116b46f59848eebcb296",
    compact: "142e5a30b99ee0c14a40f3652361756ea2f99c5f8016f83af4a8ce6966fb6d6c",
    manualCompact: "d6b46ab807fcb112f929b51898098af63daf9441a3a0e6c418016e4cd023e29e"
  }
];

export function assertCompatible(
  prototype: object,
  prepare: unknown,
  summarize: unknown,
  automatic: unknown,
  manual: unknown
): asserts prepare is Prepare {
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

  if (VERSION !== "0.99.1" || !inspected) {
    throw new Error(
      "pi-smart-compact requires the inspected Pi 0.99.1 compaction implementation; unsupported version or conflicting runtime patch."
    );
  }
}
