import { createHash } from "node:crypto";

import {
  compact,
  VERSION,
  type AgentSession,
  type ExtensionRunner,
  type SessionBeforeCompactEvent
} from "@earendil-works/pi-coding-agent";

export type ContextSnapshot = { messages: AgentSession["agent"]["state"]["messages"] };

type CompactArgs = Parameters<typeof compact>;

export type DefaultCompaction = (
  preparation: CompactArgs[0],
  model: CompactArgs[1],
  apiKey: CompactArgs[2],
  headers: CompactArgs[3],
  instructions: CompactArgs[4],
  signal: CompactArgs[5],
  env: CompactArgs[8],
  reason: SessionBeforeCompactEvent["reason"]
) => ReturnType<typeof compact>;

export type NativeSession = Pick<
  AgentSession,
  "agent" | "sessionManager" | "settingsManager" | "model" | "thinkingLevel" | "subscribe"
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
  _runAutoCompaction(reason: "manual", willRetry: false): Promise<boolean>;
};

export type Prepare = (this: NativeSession, context: ContextSnapshot) => Promise<ContextSnapshot>;

// Reviewed Pi 0.87.1 API modules and installed bundled CLI, respectively. Never
// learn fingerprints from the running host: an unknown implementation must fail closed.
const fingerprints = [
  {
    _compactBeforeNextAssistantResponse:
      "f0f46fd6146aa61b2090cb02179a81fe77694b10b016c029438e8b4ad9d64b0f",
    _runAutoCompaction: "4c0a463af9ffa0e3b5ce24738e1aa8b4ed18b244fe5f8758b7324518bdca2b99",
    _runDefaultCompaction: "a3a74001d9914f0ae10d206672110817a5ffb1210ba37bdbe911ff4f349c6b1c",
    _appendCustomMessage: "8611e9601816d650052ec466bd47ea61705c5fcb0f4e9a1cf462a0136afc4f0f",
    compact: "072f2b6ebff7b56fa5eef0f4e9614bd66fb48e7c61a673adfa77c4f89f9df433",
    manualCompact: "cf235e168e9ca6166c26a174ef537dc64530b118fe26b597d93f3ac8487c4299"
  },
  {
    _compactBeforeNextAssistantResponse:
      "2c160077d3d0e9b4654c1c7c0256fca112463c494aa9e3258870d3e34c9f08a5",
    _runAutoCompaction: "494680c7087a7e21663a22f5cada5b2b489fbd820eae56ebf4bfc62cc249bf8f",
    _runDefaultCompaction: "809a00f74b69f7c956e4039a8e8dcdaca9d003871b3ce56524e4895f9d9b72f0",
    _appendCustomMessage: "7962902b977b66315b1bf64b4c695322117728bf9701116b46f59848eebcb296",
    compact: "15622ec9429b172b7f04dc7a50b0688ad9cbe643358c5c3fa3f2c0bec9c88692",
    manualCompact: "8d70d1bff47caffddb08ce163ff87c5322fa625630cca1a9c13008ba7b8f19ac"
  }
];

export function assertCompatible(
  prototype: object,
  prepare: unknown,
  summarize: unknown
): asserts prepare is Prepare {
  const actual: Record<string, unknown> = {
    _compactBeforeNextAssistantResponse: prepare,
    _runAutoCompaction: Reflect.get(prototype, "_runAutoCompaction"),
    _runDefaultCompaction: summarize,
    _appendCustomMessage: Reflect.get(prototype, "_appendCustomMessage"),
    compact,
    manualCompact: Reflect.get(prototype, "compact")
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

  if (VERSION !== "0.87.1" || !inspected) {
    throw new Error(
      "pi-smart-compact requires the inspected Pi 0.87.1 compaction implementation; unsupported version or conflicting runtime patch."
    );
  }
}
