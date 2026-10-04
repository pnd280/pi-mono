import type { AgentSession, ToolInfo } from "@earendil-works/pi-coding-agent";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { observeNativeTools } from "@pi-mono/libs/native-tools";

import { displayMutationSink, observeNativeDefinition } from "../observation/native.ts";
import type { DisplaySession } from "../transcript/session.ts";

/** Display policy only; native provenance and mutation I/O are shared with other observers. */
export class NativeRegistry {
  private active = true;
  private native;
  private mutations;

  constructor(
    private display: (session: AgentSession) => DisplaySession | undefined,
    warning: (message: string) => void
  ) {
    this.native = observeNativeTools({
      names: ["bash", "powershell"],
      eligible: (session, name) => this.eligible(session, name),
      wrap: (session, original, settings) =>
        observeNativeDefinition(original, settings, (id) =>
          this.active
            ? this.display(session)?.beginObservation(id, `pi:${original.name}`)
            : undefined
        ),
      refreshed: (session) => this.display(session)?.refreshAdapters(),
      warning
    });
    this.mutations = observeFileMutations({
      eligible: (session, name) => this.eligible(session, name),
      begin: (session, name, id) => {
        const sink = this.display(session)?.beginObservation(id, `pi:${name}`);

        return sink ? displayMutationSink(sink, name) : undefined;
      }
    });
  }

  private eligible(session: AgentSession, name: string): boolean {
    const display = this.display(session);

    return (
      this.active &&
      !!display?.settings.valid &&
      (display.settings.rendererOverrides[name] ?? "auto") === "auto"
    );
  }

  isNative(session: AgentSession, name: string, tool?: ToolInfo): boolean {
    return this.native.isNative(session, name, tool);
  }

  bind(session: AgentSession, eligible: () => boolean): void {
    if (eligible()) this.native.bind(session);
  }

  dispose(): void {
    this.active = false;
    this.mutations.dispose();
    this.native.dispose();
  }
}
