# Keep task history only in child sessions

[pi-subagents](../../README.md#branch-history)

The Pi behaviours that this decision depends on were checked against Pi 1.0.2; see [Runtime checks](#runtime-checks). This decision replaces checkpoints, resume copies, ownership transfer, and persisted relay records, and it keeps no reader for the earlier records.

Before this decision, task history cost a full copy for each child message. Each child `message_end` and each relayed descendant record took a `get_entries` snapshot, wrote a new checkpoint file under `<agentDir>/pi-subagents/checkpoints/`, and appended a complete task record to the supervisor session. Nested supervisors repeated this for every descendant change, and each resume copied the child conversation into a new session file. Nothing deleted these files. On one Linux workstation, the directory held 3.6 GB in 4,793 files, and one supervisor session with 16 runs held 2,244 task and relay entries (2.2 MB).

Pi session files are append-only trees with stable entry IDs. Normal writes only append, and Pi rewrites a file only to initialise an empty file or to migrate an older format. A child's own session file can therefore be the only copy of its history, and the supervisor needs to store only what that file cannot show.

## Decision

Each task keeps one child session file for its whole life. A run is one child process, from launch to exit. The supervisor writes two small entries for each run, the child writes one marker for each run, and processes coordinate through the RPC streams without persisting anything. A transient lease prevents two processes from writing to one child file.

### Records

| Writer     | Custom entry          | When                                                         | Content                                                                                                                                               |
| ---------- | --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Child      | `pi-subagents.marker` | Start of each run, before the work prompt                    | `run_id`                                                                                                                                              |
| Supervisor | `pi-subagents.run`    | After the child acknowledges `begin`, before the work prompt | `task_id`, `run_id`, `previous_run_id`, `session_file`, `session_id`, `description`, requested `model` and `thinking`, `background`, and `started_at` |
| Supervisor | `pi-subagents.end`    | After the supervisor observes the child process exit         | `run_id`, `outcome`, a bounded `error`, `ended_at`, `usage`, `context`, `cache_hit`, and the final `model`, `thinking`, and `background`              |

- The `pi-subagents.result` message, the late `usage` entry from [ADR 0002](0002-count-late-background-usage.md), and the compaction reminder stay unchanged.
- A supervisor writes no task state while a run is active. Live usage, context, activity, model changes, and background promotion stay in memory until `end`.
- `end.usage` is the child's `get_session_stats` totals at collection minus a baseline taken after `begin`. Pi's statistics cover every entry in the file, including earlier runs and abandoned branches, so the baseline is required. The field is absent when the supervisor could not read the final statistics, such as after a forced stop.
- `end.outcome` comes from the existing outcome classifier, not from the exit code. A child that ends with a provider error or an aborted response still exits with code 0 after stdin EOF.

### Run lifecycle

1. The supervisor claims a new task, or an inactive direct task, and reserves capacity as it does now.
2. For a resume, the supervisor takes the [writer lease](#writer-lease) for the child file. Under the lease, it checks that the file exists and that its header has the recorded session ID.
3. The supervisor spawns the child in RPC mode with `-e <entry>` and, for a resume, `--session <file>`. The entry is the source path that Pi reports for the supervisor's own `subagents` command. When that path is not absolute, such as for an inline extension, the child relies on its settings. Pi loads an extension path only once, so a child whose settings load the same path gets one copy. A child whose settings load another copy of the package fails at startup.
4. The supervisor checks through `get_commands` that the child has the `subagents` command, then sends the reserved `/subagents begin` subcommand with the run ID and, for a resume, the ID of the task's latest run on the supervisor's branch. The child moves to the effective leaf, appends the marker, blocks later navigation, and returns an acknowledgement through the [coordination channel](#coordination). The acknowledgement contains the protocol version, run ID, session ID, session file, marker ID, and effective leaf. A missing acknowledgement fails the launch. A `handled` prompt response is not success, because Pi reports `handled` even when a command handler throws.
5. For a new task, the supervisor now takes the lease for the reported file. No other process can know that path before the `run` entry exists.
6. The supervisor reads the usage baseline, appends `run`, and sends the work prompt. Only the work prompt arms completion; administrative subcommands never do.
7. At completion, the supervisor reads the final text and statistics, checks that no accepted input made them stale, closes stdin, and waits for the exit. Then it appends `end` and releases the lease and the capacity slot.

The resume target is the final leaf of that latest run, as defined under [History](#history). The child finds it in the file that Pi has already loaded. Pi's tree navigation moves the leaf to the parent of a user or custom message, but only when that entry is not already the current leaf. To give one result in both cases, the child walks up from the target past user and custom messages. The walk stops at the run's marker at the latest, because a marker is a custom entry, not a custom message. The child navigates only when the effective leaf differs from the current leaf, and it confirms the new leaf before it acknowledges. Navigation without a summary appends no entry.

For a new task, Pi keeps the marker in memory until the work prompt is persisted. If the child stops before that, the file does not exist, and the run cannot be resumed.

### History

- A task's runs on a branch are its `run` entries on the supervisor's selected ancestry. The latest of them sets the task state: running while its process is live in this binding, `end.outcome` when an `end` exists on the branch, and otherwise `cancelled`.
- A run's entries are the child-file entries whose nearest marker ancestor is that run's marker. The run's final leaf is the last appended entry among the run's entries. The supervisor does not record the leaf: Pi's RPC stream reports message entries without their IDs.
- After `begin`, the child extension cancels tree navigation, fork, and session switch, including the RPC `fork` and `new_session` commands. A run is therefore one chain that cannot leave its marker's subtree, and the rule above has one answer.
- The viewer and `show` read the ancestry from the child file's root to the run's final leaf. `--last` uses Pi's model context on that ancestry. A cursor is an entry ID on that ancestry; any other cursor is an error.
- A child's file is also its supervisor session. Its descendants are the `run` entries on the ancestry of the child's selected run. The panel, `list`, and `show` read descendant files recursively on demand, and they cache each parsed file by path, size, and modification time. The open panel reads them again every second, because a child that runs in another process can add descendants. A record from a live update or from this binding's own run replaces a record read from a file. A file names a run before the run's live update arrives, so the read of an active task stops at its run's marker, and that run's descendants come only from live updates.
- A run's history is the same in every parent branch. A parent branch that forked during a run shows the whole run as `cancelled`, including output and descendants produced after the fork point.
- Reading never writes to a child file. Files larger than the current 64 MiB read limit show the unavailable-history diagnostic.

### Writer lease

Pi does not lock session files, and a child can outlive its supervisor until it sees stdin EOF. A parent fork, or a second process on the same parent session, can therefore try to resume a task while its child still writes the file. Each run's entries would stay separable by marker, but Pi makes each entry ID unique only among the entries that its own process has loaded. The ID has 8 hexadecimal characters, so two writers can create the same ID and make the tree ambiguous. The lease prevents a second writer without reclaiming another process's lock.

- The lease is the directory `<canonical child file>.lease/`. Each contender publishes an entry with a random name, through a temporary file and a rename. The entry lists the contender's supervisor PID. Then the contender lists the directory.
- A contender holds the lease when no other entry names a live process. An entry that it cannot parse counts as live. A signal still reaches an exited process until its parent reaps it, so on Linux the contender also reads the process state; a zombie is not live. Otherwise it removes its own entry, and the launch fails with "Task is running in another process".
- Any contender can delete an entry whose processes are all dead. The name is unique, so the deletion cannot remove a live contender's entry.
- Right after spawn, the holder atomically replaces its entry to add the child PID. When it observes the child exit, it removes its entry and then the empty directory.
- Two simultaneous contenders can both fail, but two holders are impossible: the later listing always sees the earlier contender's live entry.
- PID reuse can make a dead entry look live and block a resume until that process exits. It cannot admit a second writer.
- The lease protects only cooperating supervisors. A manual `pi --session` on a child file is not covered.

### Coordination

Coordination messages travel only on the RPC streams. They are never persisted.

| Direction           | Transport                                               | Messages                                                                                       |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Child to supervisor | `ctx.ui.setStatus` with a reserved key and JSON text    | `begin` acknowledgements, descendant task records, slot requests and releases, control replies |
| Supervisor to child | Reserved `/subagents` subcommands sent through `prompt` | `begin`, slot replies, and input, abort, and promotion for descendants                         |

- Pi runs an extension command immediately, even while the child streams, and adds no message for it. While the child runs `agent_settled` handlers, Pi defers prompts until the handlers finish, so no `agent_settled` handler may wait for a coordination reply.
- The supervisor intercepts reserved status records before dialog forwarding. It checks the existing byte limits before parsing, validates the schema, and accepts records only from a connection with an active run. A child accepts reserved subcommands only when it runs as a child.
- Every request has an ID bound to its connection and run. Capacity uses a request, a grant or denial, and an idempotent release. A child that no longer wants a grant releases it, and the supervisor releases every slot of a child subtree when that child process exits.
- Slot requests do not use `ctx.ui.input`: a timed-out or aborted dialog is removed only in the child, and Pi ignores a later answer, so the supervisor could not learn that a grant was refused.
- Active-descendant input keeps the existing rule: it retries only when no prompt was sent. A lost reply is reported, not retried.
- A descendant update carries the descendant's full in-memory task record and is sent at most every 100 ms. The start and end of a run are sent at once, so a slot request cannot arrive before its task's record. Viewers of a descendant read its file again when its record changes.
- The supervisor does not close a child's stdin while a coordination request with that child is pending.

### Ownership

- A supervisor resumes only its direct tasks. Inactive descendants are read-only.
- Input and abort still reach active owned descendants through the live route.
- Adoption, transfer intents, receipts, and `.pi-subagents.lock` are removed.

## Considered options

- **Write checkpoints only at run end.** Each run would still store a full copy, each resume would still copy the file, and a crash would lose the whole run.
- **Resume into a forked file that contains only the selected branch.** This needs no lease, but it still copies the branch on every resume.
- **Pin the child leaf in the supervisor session after each child message.** This keeps exact history at parent fork points, but the supervisor session again grows with every child message.
- **Keep persisted relay records.** Each descendant change would still add an entry to every ancestor session.
- **Use a socket as the lease.** The operating system releases it at exit, but a stale socket file cannot be replaced without a race, and socket paths have length limits.
- **Keep adoption without transfer records.** Two owners would continue one task ID on divergent branches of one file. A later operation can branch an inactive descendant into a new task of the caller in the same file without a format change.
- **Derive run usage from the child file.** Interrupted runs would get a usage value, but a second calculation could disagree with the statistics delta that the tool result reports.

## Consequences

The README must state these contract changes:

- Resume continues in the same child file as a new branch. `session_file` and `session_id` stay the same for every run of a task.
- History no longer stops at a parent fork point, as described under [History](#history).
- Runs stopped by navigation, fork, session switch, supervisor exit, or a crash have no `end` on their branch. They show as `cancelled` with unknown usage, and usage that a tool result already reported stays counted. This avoids writes after Pi starts to replace or close the session.
- An ancestor can no longer resume an inactive descendant.
- Editing or deleting a child file changes or removes task history. Continuing a child file manually extends the run that wrote the file's last entry.
- A trailing user or custom message of an interrupted run is not part of the resumed context.
- Children always load this package through `-e`. A child whose settings load another copy of the package fails to launch.
- Restored rows show the model, thinking level, and background state from `end`, or the launch values when the run has no `end`.

Maintainers must also make these changes:

- Remove `checkpoints.ts`, task records, transfers, receipts, adoption locks, persisted relay and control replies, and the matching rules in `AGENTS.md`.
- In `child/run.ts`, separate administrative subcommands from work prompts.
- Bind readers to the task, run, and leaf, and drop asynchronous results for any other run. The session ID no longer changes between runs.
- Treat custom-message targets like user-message targets in the supervisor's `session_before_tree` handler.
- Parse child files in memory. Pi's own loader appends a newline to a file that ends with a partial line.
- Update the README, `docs/testing.md`, `docs/pi-compatibility.md`, and the live-record note in ADR 0002. New invariants and tests require user approval.

For the measured session, the supervisor would store 32 small entries instead of 2,244. Nothing would remain under `<agentDir>/pi-subagents/`, and lease directories would exist only while runs are live.

## Runtime checks

A temporary probe drove offline Pi 1.0.2 RPC children with a test extension. It confirmed these behaviours:

| Behaviour            | Result                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deferred first write | After `new_session` and a marker, a child that stopped before the work prompt left no file. After the work prompt, the file started with the model and thinking entries, then the marker.                                                                               |
| Resume leaf          | An assistant target that was the current leaf needed no navigation. Trailing custom-message and user-message targets moved the leaf to their parents, the second time to a marker. An assistant target on another branch became the leaf. Navigation appended no entry. |
| Navigation boundary  | With the cancel handlers active, navigation, fork, and session switch from an extension, and the RPC `fork` and `new_session` commands, returned `cancelled` and appended nothing.                                                                                      |
| Extension binding    | Tree navigation emitted no `session_start`, so the extension context stays valid. `new_session` rebinds the extension.                                                                                                                                                  |
| Usage statistics     | `get_session_stats` after a resume included the earlier runs' usage.                                                                                                                                                                                                    |
| Command timing       | An extension command ran at once while the child streamed. A command sent while an `agent_settled` handler ran got its response after the handler finished. A command that threw returned `handled` and an `extension_error` record.                                    |
| Extension loading    | The same entry path in settings and `-e`, also as a directory in settings, gave one registration. A source path in `-e` with the package path in settings stopped Pi at startup with "Duplicate working-message id".                                                    |
| Event coverage       | Source inspection: Pi emits `entry_appended` for custom entries, context edits, and boundary drafts, not for messages.                                                                                                                                                  |

Later checks gave these results:

- **Usage across runs:** An e2e test compares the task total with the sum of the runs' usage, live and after restart. The nested background test shows that late descendant usage reaches the run's `end` entry. A run's usage is the difference of two `get_session_stats` reads, and Pi counts every entry in the file, including compaction entries. An e2e test compacts a child with a compaction entry that carries usage; both `list` and `show` include that usage.
- **Lease:** An e2e test resumes a task from a forked supervisor while a stubborn child runs, and again after the child's supervisor is killed. Both resumes fail and leave the file unchanged. After the processes exit, the next resume succeeds and removes the stale lease entries. A path alias was not tested: the lease uses the canonical path, and the `run` entries record one path.
- **Protocol races:** A one-time probe ran 3,000 random timings of slot requests, cancellations, and exits through three relays. Grants arrived after cancellation 1,156 times, and 3,325 replies to closing children failed. No slot leaked, and admission never exceeded capacity. A child writes its control reply to stdout before Pi writes the command response, so the stream keeps their order.
- **Pi 1.2.0:** The probe above was not rerun. A source comparison with Pi 1.0.2 found the session manager, RPC mode, session runtime, extension loader, tree navigation, extension-command handling, `entry_appended` emission, and session statistics unchanged. `agent_settled` gained an `aborted` field. The offline suite passes.
- **Reader cost:** A one-time probe read a 54 MiB child file with 1,143 branched runs, nested run records, and a partial last line that ended inside a multibyte character. The first read took about 190 ms and 53 MiB of heap; a cached read took about 1 ms. The reader ignored the partial line, each run resumed at its final leaf, and a file over the 64 MiB limit was unavailable.

A delayed read of one run that completes after the next run starts has no test. The run reader discards a snapshot with an earlier run ID. Without that check, the earlier run would show for one refresh only, so the case is below the testing bar.
