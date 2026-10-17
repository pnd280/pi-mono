import { spawn } from "node:child_process";

import type { RpcCommand, RpcExtensionUIRequest } from "@earendil-works/pi-coding-agent";
import { createPiLaunch, STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";

import { ChildConnection, type RpcRecord } from "../src/child/connection.ts";
import { processOptions } from "../src/child/platform.ts";
import { DEPTH_ENV, JOB_RESULT_MESSAGE } from "../src/constants.ts";
import { FIXTURE_PROVIDER } from "./provider.ts";

export class Supervisor {
  readonly records: RpcRecord[] = [];
  readonly connection: ChildConnection;

  private constructor(launch: Awaited<ReturnType<typeof createPiLaunch>>) {
    this.connection = new ChildConnection(
      spawn(launch.command, launch.args, { ...launch.options, ...processOptions(), stdio: "pipe" })
    );
    this.connection.subscribe((record) => this.records.push(record));
  }

  static async start(
    directory: string,
    options: { trusted?: boolean; sessionId?: string; fork?: string; depth?: number } = {}
  ): Promise<Supervisor> {
    const launch = await createPiLaunch({
      directory,
      ...(options.depth === undefined ? {} : { env: { [DEPTH_ENV]: String(options.depth) } }),
      args: [
        "--mode",
        "rpc",
        "--provider",
        FIXTURE_PROVIDER,
        "--model",
        "scripted",
        options.trusted === false ? "--no-approve" : "--approve",
        ...(options.sessionId ? ["--session", options.sessionId] : []),
        ...(options.fork ? ["--fork", options.fork] : [])
      ]
    });
    const host = new Supervisor(launch);

    try {
      await host.state();
    } catch (error) {
      await host.stop();
      throw error;
    }

    return host;
  }

  async request(command: RpcCommand) {
    const response = await this.connection.request(command);
    if (!response.success) throw new Error(response.error);

    return response;
  }

  async state() {
    const response = await this.request({ type: "get_state" });
    if (response.command !== "get_state") throw new Error("Missing supervisor state");

    return response.data;
  }

  async stats() {
    const response = await this.request({ type: "get_session_stats" });
    if (response.command !== "get_session_stats") throw new Error("Missing supervisor usage");

    return response.data;
  }

  async entries() {
    const response = await this.request({ type: "get_entries" });
    if (response.command !== "get_entries") throw new Error("Missing supervisor entries");

    return response.data.entries;
  }

  async results() {
    return (await this.entries()).flatMap((entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "subagent"
        ? [entry.message]
        : []
    );
  }

  async jobResults() {
    return (await this.entries()).flatMap((entry) =>
      entry.type === "custom_message" && entry.customType === JOB_RESULT_MESSAGE ? [entry] : []
    );
  }

  async prompt(message: string): Promise<void> {
    const after = this.records.length;
    const response = await this.request({ type: "prompt", message, streamingBehavior: "followUp" });
    if (response.command !== "prompt" || response.data.disposition === "handled") return;
    await this.wait((record) => record.type === "agent_settled", after);
  }

  /** Returns when the model ends its reply; the supervisor can still wait for background tasks. */
  async reply(message: string): Promise<void> {
    const after = this.records.length;
    const response = await this.request({ type: "prompt", message, streamingBehavior: "followUp" });
    if (response.command !== "prompt" || response.data.disposition === "handled") return;
    await this.wait(
      (record) =>
        record.type === "agent_settled" ||
        (record.type === "message_end" &&
          record.message.role === "assistant" &&
          record.message.stopReason !== "toolUse"),
      after
    );
  }

  /**
   * Pi answers a handled command after its handler returns, so the notification arrives first.
   * pi-subagents sends none from a session binding that is no longer current.
   */
  async command(command: string): Promise<Extract<RpcExtensionUIRequest, { method: "notify" }>> {
    const after = this.records.length;
    const response = await this.request({
      type: "prompt",
      message: `/subagents ${command}`,
      streamingBehavior: "followUp"
    });
    if (response.command !== "prompt" || response.data.disposition !== "handled")
      throw new Error("The command was not handled");
    const record = this.records
      .slice(after)
      .find((value) => value.type === "extension_ui_request" && value.method === "notify");
    if (!record) throw new Error("The command returned without a notification");

    return record;
  }

  wait(predicate: (record: RpcRecord) => boolean, after = 0): Promise<RpcRecord> {
    const existing = this.records.slice(after).find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(`Timed out waiting for supervisor event; stderr: ${this.connection.stderrTail}`)
        );
      }, STEP_TIMEOUT_MS);
      const unsubscribe = this.connection.subscribe((record) => {
        if (!predicate(record)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(record);
      });
      void this.connection.closed.then(() => {
        clearTimeout(timer);
        unsubscribe();
        reject(new Error("Supervisor exited while waiting for event"));
      });
    });
  }

  async stop(): Promise<void> {
    this.connection.closeInput();
    const timer = setTimeout(() => this.connection.process.kill("SIGKILL"), STEP_TIMEOUT_MS);

    try {
      await this.connection.closed;
    } finally {
      clearTimeout(timer);
    }
  }
}
