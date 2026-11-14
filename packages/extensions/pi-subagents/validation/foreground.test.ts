import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import {
  parseSessionEntries,
  type RpcExtensionUIRequest,
  SessionManager,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import {
  END_ENTRY,
  MARKER_ENTRY,
  RECORD_MAX_BYTES,
  RUN_ENTRY,
  TASK_ID_ENV
} from "../src/constants.ts";
import { detailsSchema } from "../src/details.ts";
import { readRunFile } from "../src/history/sessions.ts";
import { endRecordSchema, runRecordSchema } from "../src/tasks/records.ts";
import { LONG_GRACE_LIMIT, taskList, withFixture } from "./background-fixture.ts";
import { fixtureProcesses, remainingProcesses } from "./processes.ts";
import {
  FIXTURE_TEMPLATE,
  FIXTURE_TEMPLATES,
  LATE_DIALOG_ANSWERS,
  LAUNCH_FLAG,
  ORIGIN_TEMPLATES,
  REJECTED_LAUNCH_ARGS,
  REJECTED_TEMPLATE_CALLS,
  TEMPLATE_FILE,
  TEMPLATE_PROMPTS
} from "./provider.ts";
import type { Supervisor } from "./supervisor.ts";
import { createFixtureDirectory } from "./workspace.ts";

/** The supervisor's run and end entries, which are its only task entries. */
function isRunEntry(entry: SessionEntry): boolean {
  return (
    entry.type === "custom" && (entry.customType === RUN_ENTRY || entry.customType === END_ENTRY)
  );
}

const CLEANUP_ACTIONS = [
  "completed task",
  "turn abort",
  "user abort",
  "session change",
  "graceful exit",
  "queued turn abort"
] as const;

/** The actions that the test runs against a child that ignores aborts and holds its shutdown. */
const STUBBORN_ACTIONS: ReadonlySet<(typeof CLEANUP_ACTIONS)[number]> = new Set([
  "turn abort",
  "user abort",
  "session change",
  "graceful exit"
]);

async function activeTask(host: Supervisor, after = 0) {
  const record = await host.wait(
    (event) =>
      event.type === "entry_appended" &&
      event.entry.type === "custom" &&
      event.entry.customType === RUN_ENTRY,
    after
  );
  if (record.type !== "entry_appended" || record.entry.type !== "custom")
    throw new Error("Missing active task");

  return runRecordSchema.parse(record.entry.data);
}

async function waitForBash(host: Supervisor): Promise<void> {
  await host.wait(
    (event) =>
      event.type === "tool_execution_update" &&
      event.toolName === "subagent" &&
      z.object({ details: detailsSchema }).safeParse(event.partialResult).data?.details.activity ===
        "bash"
  );
}

describe.skipIf(process.platform !== "linux").concurrent("foreground subagents", () => {
  test("returns the child's text and state, including provider and launch failures", async () => {
    await withFixture(async (_directory, start) => {
      const host = await start();

      for (const [scenario, state, text] of [
        ["delegate-reply", "completed", "Fixture reply"],
        ["delegate-command", "completed", "Fixture reply"],
        ["delegate-error", "failed", "Fixture provider error"],
        ["delegate-cancelled", "cancelled", "Fixture child cancelled"],
        ["delegate-launch-error", "failed", "new_session failed (exit code 1"]
      ] as const) {
        await host.prompt(scenario);
        const result = (await host.results()).at(-1)!;
        expect(detailsSchema.parse(result.details).state).toBe(state);
        expect(contentText(result.content)).toContain(text);
        expect(result.isError).toBe(state !== "completed");
        if (scenario === "delegate-launch-error")
          expect(contentText(result.content)).toContain(
            'Model "pi-subagents-missing-provider/no-such-model" not found'
          );
      }

      expect((await taskList(host)).map((task) => task.outcome)).toEqual([
        "completed",
        "completed",
        "failed",
        "cancelled"
      ]);
    });
  });

  test.for(CLEANUP_ACTIONS)("cleans up children on %s", async (action, { expect }) => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const stubborn = STUBBORN_ACTIONS.has(action);
        let singleScenario = stubborn ? "delegate-stubborn" : "delegate-slow";
        if (action === "completed task") singleScenario = "delegate-shutdown-blocked";
        const scenario = action === "queued turn abort" ? "capacity" : singleScenario;
        const work = host.prompt(scenario).catch((error: unknown) => error);
        const child = await activeTask(host);
        if (stubborn) await waitForBash(host);

        if (action === "turn abort") {
          await expect
            .poll(
              async () => {
                const task = (await taskList(host))[0]!;

                return (await readRunFile(task)).entries.some(
                  (entry) =>
                    entry.type === "message" &&
                    entry.message.role === "assistant" &&
                    entry.message.content.some(
                      (block) => block.type === "toolCall" && block.id === "fixture-sleep"
                    )
                );
              },
              { timeout: STEP_TIMEOUT_MS }
            )
            .toBe(true);
        }

        const sessionFile = (await host.state()).sessionFile!;

        if (action === "completed task") {
          expect(await work).toBeUndefined();
          expect(detailsSchema.parse((await host.results()).at(-1)!.details).state).toBe("failed");
        } else if (action === "user abort") {
          const notification = await host.command(`abort ${child.task_id}`);
          expect(JSON.parse(notification.message)).toMatchObject({
            state: "inactive",
            outcome: "cancelled"
          });
        } else if (action === "session change") {
          await host.request({ type: "new_session" });
          expect(await taskList(host)).toEqual([]);
          // A run without an end entry stays cancelled in the saved session.
          const records = SessionManager.open(sessionFile).getEntries().filter(isRunEntry);
          expect(records.at(-1)).toMatchObject({
            customType: RUN_ENTRY,
            data: { task_id: child.task_id }
          });
        } else if (action === "graceful exit") {
          host.connection.closeInput();
          await host.connection.closed;
        } else {
          await host.request({ type: "abort" });
        }

        await work;

        if (action === "graceful exit") expect(await remainingProcesses(directory)).toEqual([]);
        else {
          const tasks = await taskList(host);
          expect(tasks.every((task) => task.state === "inactive")).toBe(true);
          expect(await fixtureProcesses(directory)).toHaveLength(1);
          if (action === "queued turn abort") expect(tasks).toHaveLength(1);
        }
      },
      {
        settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } }
      }
    );
  });

  test("kills a process-group member that ignores SIGTERM after its child exits on SIGTERM", async ({
    expect
  }) => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const work = host.prompt("delegate-group-survivor");
        await expect
          .poll(
            async () =>
              (await fixtureProcesses(directory)).some(({ command }) => command === "sleep 600"),
            { timeout: STEP_TIMEOUT_MS }
          )
          .toBe(true);
        await work;
        // The child exited on SIGTERM, before the grace period for SIGKILL ended.
        const text = contentText((await host.results()).at(-1)!.content);
        expect(text).toContain("signal SIGTERM");
        expect(text).not.toContain("force_stop failed");
        // The call returns after the forced stop, so only the supervisor remains.
        expect(await fixtureProcesses(directory)).toHaveLength(1);
      },
      { settings: { "ext.pi-subagents": { maxDepth: 1 } } }
    );
  });

  test.for(["tree", "fork", "switch"])(
    "isolates the replacement binding and immediately stops owned subtrees on %s",
    async (transition, { expect }) => {
      await withFixture(
        async (directory, start) => {
          const host = await start();
          await host.prompt("reply");
          const savedSession = (await host.state()).sessionFile!;
          await host.request({ type: "new_session" });
          await host.prompt("reply");
          const anchor = (await host.entries()).at(-1)!.id;
          const oldSession = (await host.state()).sessionId;
          await host.reply("background-slow");
          const background = (await taskList(host))[0]!;
          // The supervisor and the background task's processes.
          const retained = new Set((await fixtureProcesses(directory)).map(({ pid }) => pid));
          const work = host.prompt("nested-stubborn").catch((error: unknown) => error);

          for (let index = 0; index < STEP_TIMEOUT_MS / 25; index++) {
            if (
              (await fixtureProcesses(directory)).some(({ command }) =>
                command.includes("sleep 600")
              )
            )
              break;
            if (index === STEP_TIMEOUT_MS / 25 - 1)
              throw new Error("Detached descendant did not start");
            await setTimeout(25);
          }

          expect(
            (await taskList(host)).find((task) => task.task_id === background.task_id)?.state
          ).toBe("active");

          if (transition === "tree") {
            const abort = host.request({ type: "abort" });
            // A turn abort stops the stubborn subtree; a graceful stop would outlast this wait.
            await expect
              .poll(
                async () =>
                  (await fixtureProcesses(directory)).filter(({ pid }) => !retained.has(pid)),
                { timeout: STEP_TIMEOUT_MS }
              )
              .toEqual([]);
            await abort;
          }

          const navigation =
            transition === "switch"
              ? host.request({ type: "switch_session", sessionPath: savedSession })
              : host.request({
                  type: "prompt",
                  message: `/fixture-${transition === "tree" ? "tree" : "parent-fork"} ${anchor}`
                });
          // A graceful stop of the stubborn grandchild would outlast this wait.
          await expect
            .poll(
              async () =>
                (await fixtureProcesses(directory)).filter(
                  ({ pid }) => pid !== host.connection.process.pid
                ),
              { timeout: STEP_TIMEOUT_MS }
            )
            .toEqual([]);
          await navigation;
          await work;
          expect(await taskList(host)).toEqual([]);
          expect((await host.state()).sessionId === oldSession).toBe(transition === "tree");
          const count = (await host.entries()).filter(isRunEntry).length;
          await host.prompt("reply");
          expect(await taskList(host)).toEqual([]);
          expect((await host.entries()).filter(isRunEntry)).toHaveLength(count);
        },
        {
          settings: {
            "ext.pi-subagents": { maxDepth: LONG_GRACE_LIMIT, maxConcurrent: LONG_GRACE_LIMIT }
          }
        }
      );
    }
  );

  test("resumes stopped tasks in their child file from the selected ancestry with stable IDs", async () => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        await host.prompt("delegate-remember");
        const original = (await taskList(host))[0]!;
        const records = (await host.entries()).filter(isRunEntry);
        const empty = records[0]!.id;
        const saved = records.at(-1)!.id;
        await host.prompt(`extend-id ${original.task_id}`);
        expect((await taskList(host)).length).toBeGreaterThan(1);
        const laterBytes = await readFile(original.session_file, "utf8");
        await host.request({ type: "prompt", message: `/fixture-tree ${saved}` });
        expect(await taskList(host)).toEqual([original]);
        await host.prompt(`history-id ${original.task_id}`);
        const resumedText = contentText((await host.results()).at(-1)!.content);
        expect(resumedText).toContain("remember");
        expect(resumedText).not.toContain("nested-background");
        expect(await taskList(host)).toMatchObject([
          {
            task_id: original.task_id,
            session_id: original.session_id,
            session_file: original.session_file
          }
        ]);
        // A resume appends to the child file and keeps the excluded run.
        expect((await readFile(original.session_file, "utf8")).startsWith(laterBytes)).toBe(true);

        const leaf = (await host.entries()).at(-1)!.id;
        await host.request({ type: "prompt", message: `/fixture-parent-fork ${leaf}` });
        expect(await taskList(host)).toHaveLength(1);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        await host.request({ type: "prompt", message: `/fixture-tree ${empty}` });
        expect(await taskList(host)).toMatchObject([
          { task_id: original.task_id, state: "inactive", outcome: "cancelled" }
        ]);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        // A run without an end entry continues its own history, without the later runs.
        await host.prompt(`history-id ${original.task_id}`);
        const cancelledText = contentText((await host.results()).at(-1)!.content);
        expect(cancelledText).toContain("remember");
        expect(cancelledText).not.toContain("nested-background");
        expect(cancelledText.split("history-context")).toHaveLength(2);
        expect(await taskList(host)).toHaveLength(1);

        const after = host.records.length;
        const work = host.prompt("delegate-stubborn").catch((error: unknown) => error);
        const interrupted = await activeTask(host, after);
        await waitForBash(host);

        for (let index = 0; index < STEP_TIMEOUT_MS / 25; index++) {
          if ((await fixtureProcesses(directory)).some(({ command }) => command === "sleep 600"))
            break;
          if (index === STEP_TIMEOUT_MS / 25 - 1)
            throw new Error("Interrupted effect did not finish");
          await setTimeout(25);
        }

        const effect = await stat(`${directory}/work/interrupted-effect`);
        // A fork at the running task's run entry stops the task and shows it as stopped.
        const runEntry = (await host.entries()).find(
          (entry) =>
            entry.type === "custom" &&
            entry.customType === RUN_ENTRY &&
            runRecordSchema.parse(entry.data).run_id === interrupted.run_id
        )!;
        await host.request({ type: "prompt", message: `/fixture-parent-fork ${runEntry.id}` });
        expect(
          (await taskList(host)).find((task) => task.task_id === interrupted.task_id)
        ).toMatchObject({ state: "inactive", outcome: "cancelled" });
        await work;
        const warningStart = host.records.length;
        await host.prompt(`history-id ${interrupted.task_id}`);
        expect(
          host.records
            .slice(warningStart)
            .some(
              (event) =>
                event.type === "extension_ui_request" &&
                event.method === "notify" &&
                event.notifyType === "warning"
            )
        ).toBe(true);
        expect((await stat(`${directory}/work/interrupted-effect`)).mtimeMs).toBe(effect.mtimeMs);
        expect(await fixtureProcesses(directory)).toHaveLength(1);

        // A label that the tool accepts above the record limit leaves a run record that recovery keeps, so a rebuilt binding lists the task and resumes it in its child file.
        await host.prompt("delegate-long-label");
        const labelled = detailsSchema.parse((await host.results()).at(-1)!.details).task_id!;
        const labelledRun = (await host.entries())
          .flatMap((entry) =>
            entry.type === "custom" && entry.customType === RUN_ENTRY ? [entry] : []
          )
          .at(-1)!;
        expect(Buffer.byteLength(JSON.stringify(labelledRun.data))).toBeLessThanOrEqual(
          RECORD_MAX_BYTES
        );
        const live = (await taskList(host)).find((task) => task.task_id === labelled)!;
        await host.request({
          type: "prompt",
          message: `/fixture-parent-fork ${(await host.entries()).at(-1)!.id}`
        });
        const identity = {
          task_id: labelled,
          session_id: live.session_id,
          session_file: live.session_file
        };
        expect((await taskList(host)).find((task) => task.task_id === labelled)).toMatchObject(
          identity
        );
        await host.prompt(`history-id ${labelled}`);
        expect(detailsSchema.parse((await host.results()).at(-1)!.details).state).toBe("completed");
        expect((await taskList(host)).find((task) => task.task_id === labelled)).toMatchObject(
          identity
        );

        // The supervisor stores two small entries per run, whatever its children write. Only the bounded long label above makes its run entry larger.
        const stored = host.records.flatMap((event) =>
          event.type === "entry_appended" &&
          event.entry.type === "custom" &&
          event.entry.customType.startsWith("pi-subagents.")
            ? [event.entry]
            : []
        );
        const runs = stored.flatMap((entry) =>
          entry.customType === RUN_ENTRY ? [runRecordSchema.parse(entry.data).run_id] : []
        );
        const ends = stored.flatMap((entry) =>
          entry.customType === END_ENTRY ? [endRecordSchema.parse(entry.data).run_id] : []
        );
        expect(stored).toHaveLength(runs.length + ends.length);
        expect(runs).toHaveLength(
          host.records.filter(
            (event) => event.type === "tool_execution_start" && event.toolName === "subagent"
          ).length
        );
        expect(new Set(runs).size).toBe(runs.length);
        expect(new Set(ends).size).toBe(ends.length);
        expect(ends.every((run) => runs.includes(run))).toBe(true);
        for (const entry of stored)
          if (entry.id !== labelledRun.id)
            expect(Buffer.byteLength(JSON.stringify(entry.data))).toBeLessThan(2048);
        expect(await readdir(join(directory, "agent"))).not.toContain("pi-subagents");
        expect(
          (await readdir(dirname(original.session_file))).filter((name) => name.endsWith(".lease"))
        ).toEqual([]);
      },
      { settings: { "ext.pi-subagents": { maxDepth: 3, maxConcurrent: 6 } } }
    );
  });

  test("resumes with the selection that the task's latest run on the selected ancestry requested", async () => {
    await withFixture(async (_directory, start) => {
      const host = await start();

      /** The model and thinking level of the child's provider request. */
      const selection = async (scenario: string) => {
        await host.prompt(scenario);

        return /Selection: (\S+)/.exec(contentText((await host.results()).at(-1)!.content))?.[1];
      };

      expect(await selection("delegate-reasoning")).toBe("subagents-fixture/reasoning:high");
      const taskId = (await taskList(host))[0]!.task_id;
      const launched = (await host.entries()).at(-1)!.id;
      // The scripted model has no thinking levels, so this run applies `off` but requests `low`.
      expect(await selection(`selection-id ${taskId} model=scripted thinking=low`)).toBe(
        "subagents-fixture/scripted:off"
      );
      // The supervisor's own selection is `subagents-fixture/scripted:off`. A value in the call replaces only its own field.
      expect(await selection(`selection-id ${taskId} model=reasoning`)).toBe(
        "subagents-fixture/reasoning:low"
      );
      // The later runs stay at the end of the child file, but they are not on the selected ancestry.
      await host.request({ type: "prompt", message: `/fixture-tree ${launched}` });
      expect(await selection(`selection-id ${taskId}`)).toBe("subagents-fixture/reasoning:high");
    });
  });

  test("passes launch_args and template values before the extension's flags, rejects owned and trust flags, `--`, a last value flag, and invalid template calls, reuses launch_args on resume, and applies a template on resume", async () => {
    await withFixture(
      async (directory, start) => {
        // The template file's prompt paths resolve from its own directory.
        const templateFile = join(directory, "agent", TEMPLATE_FILE);
        const prompts = TEMPLATE_PROMPTS.map((name) => join(dirname(templateFile), name));
        await mkdir(dirname(templateFile));
        await Promise.all([
          writeFile(templateFile, JSON.stringify(FIXTURE_TEMPLATE)),
          ...prompts.map((path) => writeFile(path, `Fixture prompt ${path}\n`))
        ]);
        const host = await start();

        /** Whether the child's argv has the launch arguments before the extension's `--mode`. */
        const argvOrder = async (scenario: string) => {
          await host.prompt(scenario);
          const result = (await host.results()).at(-1)!;
          expect(detailsSchema.parse(result.details).state).toBe("completed");
          const argv = z
            .array(z.string())
            .parse(JSON.parse(/^\[.*\]$/m.exec(contentText(result.content))?.[0] ?? "null"));
          const flag = argv.indexOf(`--${LAUNCH_FLAG}`);

          return flag >= 0 && argv[flag + 1] === "marker" && flag < argv.indexOf("--mode");
        };

        const runEntries = async () =>
          (await host.entries()).filter(
            (entry) => entry.type === "custom" && entry.customType === RUN_ENTRY
          ).length;

        expect(await argvOrder("delegate-launch-args")).toBe(true);
        const runs = await runEntries();

        // Each flag that another parameter owns, and a last flag that needs a value, fails its call before a task, record, or process exists. The exact text separates this check from a launch that Pi itself rejects or that never starts RPC.
        await host.prompt("delegate-owned-arg");
        const rejected = (await host.results()).slice(-REJECTED_LAUNCH_ARGS.length);
        expect(rejected.map((result) => [result.isError, contentText(result.content)])).toEqual(
          REJECTED_LAUNCH_ARGS.map(([, error]) => [true, error])
        );
        expect(await runEntries()).toBe(runs);
        const tasks = await taskList(host);
        expect(tasks).toHaveLength(1);

        expect(await argvOrder(`argv-id ${tasks[0]!.task_id}`)).toBe(true);

        /** The last `count` results by their call's description, with each child's selection, launch arguments, and level. */
        const launches = async (count: number) => {
          // The result's label adds the template name, which is below the severity bar.
          const descriptions = new Map(
            (await host.entries()).flatMap((entry) =>
              entry.type === "message" && entry.message.role === "assistant"
                ? entry.message.content.flatMap((part) =>
                    part.type === "toolCall"
                      ? [[part.id, z.string().parse(part.arguments.description)] as const]
                      : []
                  )
                : []
            )
          );

          return Object.fromEntries(
            (await host.results()).slice(-count).map((result) => {
              const details = detailsSchema.parse(result.details);
              expect(details.state).toBe("completed");
              const text = contentText(result.content);
              const argv = z
                .array(z.string())
                .parse(JSON.parse(/^\[.*\]$/m.exec(text)?.[0] ?? "null"));

              const mode = argv.indexOf("--mode");

              return [
                descriptions.get(result.toolCallId) ?? `Missing call ${result.toolCallId}`,
                {
                  selection: /Selection: (\S+)/.exec(text)?.[1],
                  // The child's `process.argv` starts with Node and the Pi script.
                  args: argv.slice(2, mode),
                  thinking: argv[argv.indexOf("--thinking", mode) + 1]
                }
              ];
            })
          );
        };

        // A call value replaces the template's value, and an omitted one takes it. The call's launch arguments come first, then the template's, then its prompt files as absolute paths in order. The extension's `--thinking` after `--mode` is the requested level.
        await host.prompt("delegate-template");
        const templateArgs = [
          "--tools",
          "read",
          ...prompts.flatMap((path) => ["--append-system-prompt", path])
        ];
        expect(await launches(3)).toEqual({
          "Template defaults": {
            selection: "subagents-fixture/reasoning:high",
            args: [`--${LAUNCH_FLAG}`, "marker", ...templateArgs],
            thinking: "high"
          },
          "Template call thinking": {
            selection: "subagents-fixture/reasoning:low",
            args: templateArgs,
            thinking: "low"
          },
          // The scripted model has no thinking levels, so the child applies `off` to the template's requested level.
          "Template call model": {
            selection: "subagents-fixture/scripted:off",
            args: templateArgs,
            thinking: "high"
          }
        });

        // On resume, the template's values replace those of the task's latest run, which requested the default model and the marker arguments.
        await host.prompt(`template-resume ${tasks[0]!.task_id}`);
        expect(await launches(1)).toEqual({
          "Template resume": {
            selection: "subagents-fixture/reasoning:high",
            args: templateArgs,
            thinking: "high"
          }
        });
        const templateRuns = await runEntries();

        // An unknown or left-out template, and a call flag that the template also sets, fail before a task, record, or process exists.
        await host.prompt("template-rejected");
        const failed = (await host.results()).slice(-REJECTED_TEMPLATE_CALLS.length);
        expect(failed.map((result) => [result.isError, contentText(result.content)])).toEqual(
          REJECTED_TEMPLATE_CALLS.map(([, error]) => [true, error])
        );
        expect(await runEntries()).toBe(templateRuns);
        expect(await taskList(host)).toHaveLength(4);
      },
      { settings: { "ext.pi-subagents": { templates: FIXTURE_TEMPLATES } } }
    );
  });

  test("resolves a global template's path launch arguments from its file, not the untrusted project, and leaves out a template with a system prompt flag", async () => {
    /**
     * The path values of the `origin` template file. The template's directory and the project each hold a file at `path` that adds `ORIGIN_<TEMPLATE|PROJECT>_<kind>` to the child's system prompt. The comment of each row names the defect that the earlier rows cannot catch. The kinds are in sorted order.
     */
    const sources = [
      // The child receives `launchArgs` unresolved and loads `./` from the project.
      { args: ["-e", "./origin.ts"], path: "origin.ts", kind: "EXTENSION" },
      // The remote-source exemption covers a package-like value that Pi reads as a local path.
      { args: ["-e", "github:owner/repo"], path: "github:owner/repo/index.ts", kind: "PACKAGE" },
      // The remote-source exemption applies to `--skill`, where Pi reads `npm:` as a local path.
      { args: ["--skill", "npm:origin"], path: "npm:origin/SKILL.md", kind: "SKILL" }
    ];
    /**
     * The system prompt flags, each in its own inline template in `ORIGIN_TEMPLATES` order, so that a rejection that misses one flag fails its own call.
     */
    const promptFlags = ["--system-prompt", "--append-system-prompt"];

    await withFixture(
      async (directory, start) => {
        const scopes = {
          TEMPLATE: join(directory, "agent", "templates"),
          PROJECT: join(directory, "work")
        };
        const writes = Object.entries(scopes).flatMap(([scope, base]) =>
          sources.map(async ({ path, kind }) => {
            const origin = `ORIGIN_${scope}_${kind}`;
            await mkdir(dirname(join(base, path)), { recursive: true });
            await writeFile(
              join(base, path),
              kind === "SKILL"
                ? `---\nname: origin-${scope.toLowerCase()}\ndescription: ${origin}\n---\n`
                : `export default (pi) => pi.on("before_agent_start", (event) => ({ systemPrompt: event.systemPrompt + "\\n${origin}" }));\n`
            );
          })
        );
        await Promise.all(writes);
        await Promise.all([
          writeFile(
            join(scopes.TEMPLATE, "origin.json"),
            JSON.stringify({
              name: ORIGIN_TEMPLATES[0],
              description: "Template with path launch arguments",
              launchArgs: sources.flatMap(({ args }) => args)
            })
          ),
          // Pi reads the value of a system prompt flag from the file of that name in the project.
          writeFile(join(scopes.PROJECT, "README.md"), "ORIGIN_PROJECT_PROMPT\n")
        ]);
        const host = await start({ trusted: false });

        await host.prompt("delegate-origins");
        const [origin, ...rejected] = (await host.results()).slice(-ORIGIN_TEMPLATES.length);
        expect(detailsSchema.parse(origin!.details).state).toBe("completed");
        // The child's provider request has only the template directory's files.
        expect(/^Origins: .*$/m.exec(contentText(origin!.content))?.[0]).toBe(
          `Origins: ${sources.map(({ kind }) => `ORIGIN_TEMPLATE_${kind}`).join(" ")}`
        );
        // Settings leave out the templates with a system prompt flag, so their calls fail before a task, record, or process exists.
        expect(rejected.map((result) => [result.isError, contentText(result.content)])).toEqual(
          ORIGIN_TEMPLATES.slice(1).map((name) => [
            true,
            expect.stringContaining(`Unknown template ${name}`) as unknown
          ])
        );
        expect(await taskList(host)).toHaveLength(1);
      },
      {
        settings: {
          "ext.pi-subagents": {
            templates: [
              "templates/origin.json",
              ...promptFlags.map((flag, index) => ({
                name: ORIGIN_TEMPLATES[index + 1],
                description: "Template with a system prompt flag",
                launchArgs: [flag, "README.md"]
              }))
            ]
          }
        }
      }
    );
  });

  test.each([false, true])(
    "uses only trusted project settings for limits and docs, passes the chosen trust flag, and refuses a resume from another directory (%s)",
    async (trusted) => {
      await withFixture(
        async (directory, start) => {
          await Promise.all([
            writeFile(join(directory, "agent", "docs.md"), "GLOBAL_SUBAGENT_DOCS\n"),
            writeFile(join(directory, "work", ".pi", "docs.md"), "PROJECT_SUBAGENT_DOCS\n")
          ]);
          const host = await start({ trusted });
          await host.prompt("delegate-trust");
          const result = (await host.results()).at(-1)!;
          expect(detailsSchema.parse(result.details).state).toBe("completed");
          expect(contentText(result.content)).toContain(
            JSON.stringify({ approve: trusted, no_approve: !trusted })
          );
          // A trusted project list replaces the global one; each path resolves in its own scope.
          await host.prompt("report-docs");
          const description = (await host.entries())
            .flatMap((entry) =>
              entry.type === "message" && entry.message.role === "assistant"
                ? [contentText(entry.message.content)]
                : []
            )
            .at(-1);
          expect(description).toContain(trusted ? "PROJECT_SUBAGENT_DOCS" : "GLOBAL_SUBAGENT_DOCS");
          expect(description).not.toContain(
            trusted ? "GLOBAL_SUBAGENT_DOCS" : "PROJECT_SUBAGENT_DOCS"
          );
          // Global and trusted project templates combine; an untrusted project template is unknown.
          expect(description).toContain("GLOBAL_TEMPLATE");
          expect(description?.includes("PROJECT_TEMPLATE")).toBe(trusted);

          if (!trusted) {
            const runs = (await host.entries()).filter(isRunEntry).length;
            await host.prompt("delegate-project-template");
            const rejected = (await host.results()).at(-1)!;
            expect([rejected.isError, contentText(rejected.content)]).toEqual([
              true,
              "Unknown template project; the templates are global"
            ]);
            expect((await host.entries()).filter(isRunEntry)).toHaveLength(runs);

            // Pi opens a child file in the directory of its header. A trusted fork of this session in another directory would resume the child here with its own trust, so the resume fails before a child starts.
            const task = (await taskList(host))[0]!;
            const other = await createFixtureDirectory(directory, "other");
            const fork = await start({ fork: (await host.state()).sessionFile!, cwd: other });
            const forkRuns = (await fork.entries()).filter(isRunEntry).length;
            const child = await readFile(task.session_file);
            await fork.prompt(`resume-id ${task.task_id}`);
            const refused = (await fork.results()).at(-1)!;
            expect(refused.isError).toBe(true);
            expect(contentText(refused.content)).toContain(
              `Task ${task.task_id} belongs to ${await realpath(join(directory, "work"))}, not ${await realpath(other)}; resume it from a supervisor in that directory`
            );
            expect((await fork.entries()).filter(isRunEntry)).toHaveLength(forkRuns);
            expect(await readFile(task.session_file)).toEqual(child);
          }

          // Only a trusted project turns on jobs.
          await host.prompt("report-job-tools");
          const tools = await host.request({ type: "get_last_assistant_text" });
          expect(tools.command === "get_last_assistant_text" ? tools.data.text : "").toBe(
            `job tools: ${trusted} ${trusted}`
          );
        },
        {
          // In either direction, loading the wrong settings disables the tool and breaks this call.
          settings: {
            "ext.pi-subagents": {
              maxDepth: trusted ? 0 : 2,
              docs: ["docs.md"],
              templates: [{ name: "global", description: "GLOBAL_TEMPLATE" }]
            }
          },
          projectSettings: {
            "ext.pi-subagents": {
              maxDepth: trusted ? 2 : 0,
              docs: ["docs.md"],
              jobs: true,
              templates: [{ name: "project", description: "PROJECT_TEMPLATE" }]
            }
          }
        }
      );
    }
  );

  test("recovers task ownership and context across restart, and counts each call's usage once", async () => {
    await withFixture(async (directory, start) => {
      const host = await start();
      await host.prompt("delegate-remember");
      const first = (await host.results()).at(-1)!;
      const taskId = detailsSchema.parse(first.details).task_id!;
      expect(first.usage).toMatchObject({
        input: 10,
        output: 5,
        totalTokens: 15,
        cost: { total: 0.001 }
      });
      expect((await host.stats()).tokens.total).toBe(45);
      const saved = (await taskList(host)).find((task) => task.task_id === taskId)!;
      const { sessionId } = await host.state();
      const after = host.records.length;
      const work = host.prompt("delegate-slow").catch((error: unknown) => error);
      const stale = await activeTask(host, after);
      host.connection.process.kill("SIGKILL");
      await host.connection.closed;
      await work;
      expect(await remainingProcesses(directory)).toEqual([]);

      const resumed = await start({ sessionId });
      expect(await taskList(resumed)).toContainEqual(
        expect.objectContaining({
          task_id: stale.task_id,
          state: "inactive",
          outcome: "cancelled"
        })
      );
      const before = await resumed.stats();
      await resumed.prompt(`resume-id ${taskId}`);
      const last = (await resumed.results()).at(-1)!;
      expect(contentText(last.content)).toContain("Remembered fixture seed");
      expect(last.usage).toMatchObject({
        input: 10,
        output: 5,
        totalTokens: 15,
        cost: { total: 0.001 }
      });
      expect((await resumed.stats()).tokens.total - before.tokens.total).toBe(45);
      expect((await taskList(resumed)).find((task) => task.task_id === taskId)?.session_file).toBe(
        saved.session_file
      );
      // The task total adds each run's own usage, also when it is restored from the session.
      const total = { input: 20, output: 10, cache_read: 0, cache_write: 0, cost: 0.002 };
      expect((await taskList(resumed)).find((task) => task.task_id === taskId)?.usage).toEqual(
        total
      );
      await resumed.stop();
      const restored = await start({ sessionId });
      expect((await taskList(restored)).find((task) => task.task_id === taskId)?.usage).toEqual(
        total
      );
    });
  });

  test("rejects resume and abort for tasks owned by another supervisor", async () => {
    await withFixture(async (_directory, start) => {
      const owner = await start();
      await owner.prompt("delegate-remember");
      const child = (await taskList(owner))[0]!;
      const before = await readFile(child.session_file, "utf8");
      const other = await start();
      await other.prompt(`resume-id ${child.task_id}`);
      const result = (await other.results()).at(-1)!;
      expect(result.isError).toBe(true);
      expect(contentText(result.content)).toContain("Task does not belong to this session");
      const notice = await other.command(`abort ${child.task_id}`);
      expect(notice.notifyType).toBe("error");
      expect(JSON.parse(notice.message)).toEqual({
        error: "Task does not belong to this session"
      });
      expect(await taskList(other)).toEqual([]);
      expect(await readFile(child.session_file, "utf8")).toBe(before);
    });
  });

  test("lets one process at a time write a task's child file, also after its supervisor is killed", async ({
    expect
  }) => {
    await withFixture(async (directory, start) => {
      const first = await start();
      await first.prompt("delegate-remember");
      const task = (await taskList(first))[0]!;
      // A fork of the supervisor session owns the same task.
      const second = await start({ fork: (await first.state()).sessionFile! });
      const runs = async () =>
        parseSessionEntries(await readFile(task.session_file, "utf8")).filter(
          (entry) => entry.type === "custom" && entry.customType === MARKER_ENTRY
        ).length;
      const others = async () =>
        (await fixtureProcesses(directory)).filter(
          ({ pid }) => pid !== second.connection.process.pid
        );

      // The held writer writes nothing while it runs `sleep 600` or blocks its shutdown.
      const rejected = async () => {
        const held = await readFile(task.session_file);
        await second.prompt(`history-id ${task.task_id}`);
        const result = (await second.results()).at(-1)!;
        expect(result.isError).toBe(true);
        expect(contentText(result.content)).toContain("Task is running in another process");
        // No second writer changed the file.
        expect(await readFile(task.session_file)).toEqual(held);
      };

      const work = first.prompt(`stubborn-id ${task.task_id}`).catch((error: unknown) => error);
      await expect
        .poll(async () => (await others()).some(({ command }) => command.includes("sleep 600")), {
          // The resumed child starts a new Pi process, which takes seconds under full load.
          timeout: STEP_TIMEOUT_MS,
          interval: 25
        })
        .toBe(true);
      await rejected();

      // The child outlives its supervisor, so it can still write. On EOF, Pi aborts the child's run and saves its last entries, and the child then blocks its shutdown.
      first.connection.process.kill("SIGKILL");
      await first.connection.closed;
      await work;
      await expect
        .poll(
          () =>
            readFile(join(directory, "work", "shutdown-ready")).then(
              () => true,
              () => false
            ),
          { timeout: STEP_TIMEOUT_MS, interval: 25 }
        )
        .toBe(true);
      await rejected();

      for (const { pid } of await others()) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* It exited after the listing. */
        }
      }

      await expect.poll(others, { timeout: STEP_TIMEOUT_MS }).toEqual([]);
      await second.prompt(`history-id ${task.task_id}`);
      expect(detailsSchema.parse((await second.results()).at(-1)!.details).state).toBe("completed");
      expect(await runs()).toBe(3);
      // The dead writers' entry was removed with the lease.
      expect(
        (await readdir(dirname(task.session_file))).filter((name) => name.endsWith(".lease"))
      ).toEqual([]);
    });
  });

  test("forwards child dialogs and delivers their answers", async () => {
    await withFixture(async (_directory, start) => {
      const host = await start();
      const editor = (answer: (shown: string) => string) => (request: RpcExtensionUIRequest) =>
        request.method === "editor" ? answer(request.prefill!) : "";
      const dialogs: ReadonlyArray<{
        scenario: string;
        method: RpcExtensionUIRequest["method"];
        answer: (request: RpcExtensionUIRequest) => boolean | string;
        /** The child's reply, or a function of the submitted answer that gives it. */
        result: string | ((submitted: boolean | string) => string);
      }> = [
        {
          scenario: "delegate-dialog",
          method: "confirm",
          answer: () => true,
          result: "Dialog accepted"
        },
        {
          // Distinct child options can collide after terminal sanitisation.
          scenario: "delegate-selection",
          method: "select",
          answer: (request) => (request.method === "select" ? request.options[1]! : ""),
          result: "Selected second option"
        },
        // Editor answers to the shown prefill, which is sanitised and cut. Pi's RPC client can return the shown prefill unchanged.
        {
          scenario: "delegate-editor",
          method: "editor",
          answer: editor((shown) => shown),
          result: "Editor prefill kept"
        },
        // Pi's editor returns the text with line ends normalised, tabs expanded, and trimmed.
        {
          scenario: "delegate-editor",
          method: "editor",
          answer: editor((shown) => shown.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim()),
          result: "Editor prefill kept"
        },
        // An edit by whitespace only reaches the child exactly as submitted, because the RPC client's answer is not normalised. The child reports the SHA-256 of what it received.
        {
          scenario: "delegate-editor",
          method: "editor",
          answer: editor((shown) => ` ${shown}`),
          result: (submitted) =>
            `Editor answer ${createHash("sha256").update(String(submitted)).digest("hex")}`
        }
      ];

      for (const { scenario, method, answer, result } of dialogs) {
        // Each dialog has its own cursor, so an earlier request cannot answer this step.
        const after = host.records.length;
        const work = host.prompt(scenario);
        const request = await host.wait(
          (record) => record.type === "extension_ui_request" && record.method === method,
          after
        );
        if (request.type !== "extension_ui_request") throw new Error("Missing dialog request");
        const value = answer(request);
        await host.connection.respond(
          typeof value === "boolean"
            ? { type: "extension_ui_response", id: request.id, confirmed: value }
            : { type: "extension_ui_response", id: request.id, value }
        );
        await work;
        const expected = typeof result === "string" ? result : result(value);
        expect(contentText((await host.results()).at(-1)!.content), expected).toContain(expected);
      }
    });
  });

  test("cancels the open dialogs of a cancelled run, also against a late answer", async () => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const answer = (file: string) => readFile(join(directory, "work", file), "utf8");
        const after = host.records.length;
        const work = host.prompt("delegate-late-dialogs");
        const open = (method: RpcExtensionUIRequest["method"]) =>
          host.wait(
            (record) => record.type === "extension_ui_request" && record.method === method,
            after
          );
        await open("select");
        const editor = await open("editor");
        if (editor.type !== "extension_ui_request") throw new Error("Missing editor dialog");
        const aborted = host.command(`abort ${(await taskList(host))[0]!.task_id}`);

        // The selection closes at the cancellation, so the child receives it as cancelled unanswered.
        await expect
          .poll(() => answer(LATE_DIALOG_ANSWERS.select).catch(() => undefined), {
            timeout: STEP_TIMEOUT_MS
          })
          .toBe("cancelled");
        // Pi's editor cannot close, so the supervisor's client can still answer it.
        await host.connection.respond({
          type: "extension_ui_response",
          id: editor.id,
          value: "Late edit"
        });

        expect(JSON.parse((await aborted).message)).toMatchObject({
          state: "inactive",
          outcome: "cancelled"
        });
        await work;
        expect(await answer(LATE_DIALOG_ANSWERS.editor)).toBe("cancelled");
      },
      // The late answer must reach the child before its stop deadline, so the deadline must be longer than a fixture step.
      {
        settings: {
          "ext.pi-subagents": { maxDepth: LONG_GRACE_LIMIT, maxConcurrent: LONG_GRACE_LIMIT }
        }
      }
    );
  });

  test("respects capacity, admits queued launches FIFO, and rejects a full queue", async ({
    expect
  }) => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const children = async () =>
          (await fixtureProcesses(directory)).filter(
            ({ pid }) => pid !== host.connection.process.pid
          );
        // Samples the live children for the whole call, so an overlap of two children shows.
        const sampling = new AbortController();
        let most = 0;
        const sampler = (async () => {
          while (!sampling.signal.aborted) {
            most = Math.max(most, (await children()).length);
            await setTimeout(10);
          }
        })();

        /** The process and task of a child that is not in `seen`, once the task is listed. */
        const nextChild = async (seen: ReadonlySet<number>) => {
          for (let poll = 0; poll < STEP_TIMEOUT_MS / 25; poll++) {
            await setTimeout(25);

            for (const { pid } of await children()) {
              if (seen.has(pid)) continue;
              // Before its exec, a new process has the supervisor's environment; it can also exit.
              const environ = await readFile(`/proc/${pid}/environ`, "utf8").catch(() => "");
              const taskId = environ
                .split("\0")
                .find((variable) => variable.startsWith(`${TASK_ID_ENV}=`))
                ?.slice(TASK_ID_ENV.length + 1);
              if (taskId === undefined) continue;
              const task = (await taskList(host)).find((item) => item.task_id === taskId);
              if (task) return { pid, description: task.description };
            }
          }

          throw new Error("No queued child started");
        };

        const order = ["First capacity task", "Second capacity task", "Third capacity task"];
        const work = host.prompt("capacity-held").catch((error: unknown) => error);
        const started: string[] = [];
        const seen = new Set<number>();

        try {
          while (started.length < order.length) {
            const child = await nextChild(seen);
            seen.add(child.pid);
            // Each child holds until its release, so no other child may run beside it.
            expect((await children()).map(({ pid }) => pid)).toEqual([child.pid]);
            started.push(child.description);
            const release = `capacity-release-${order.indexOf(child.description) + 1}`;
            await writeFile(join(directory, "work", release), "");
          }

          expect(await work).toBeUndefined();
        } finally {
          sampling.abort();
          await sampler;
        }

        expect(started).toEqual(order);
        expect(most).toBe(1);
        const overflow = (await host.results()).find(
          (result) =>
            detailsSchema.safeParse(result.details).data?.description === "Overflow capacity task"
        )!;
        expect(contentText(overflow.content)).toContain("launch queue is full (");
        expect(overflow.isError).toBe(true);
      },
      { settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } } }
    );
  });
});
