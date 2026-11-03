import { todoInputSchema } from "../tool-schema.ts";
import type { Task, TaskMutationResult, TodoState } from "./model.ts";
import { applyTaskInput, cloneState, cloneTask, emptyTodoState } from "./reducer.ts";
import { todoStateFromBranch } from "./session-state.ts";

export class TodoController {
  private state: TodoState = emptyTodoState();
  private revision = 0;

  getState(): TodoState {
    return cloneState(this.state);
  }

  getTodos(): readonly Task[] {
    return this.state.tasks.map(cloneTask);
  }

  /** Monotonic change marker letting presentation layers cache derived snapshots. */
  getRevision(): number {
    return this.revision;
  }

  /** The one entry for `todo` tool input. An invalid parameter shape throws. */
  apply(input: unknown): Pick<TaskMutationResult, "content" | "details"> {
    const parsed = todoInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid todo parameters");
    const { action, metadata, ...params } = parsed.data;
    const result = applyTaskInput(this.state, action, params, metadata);
    const changed = result.state !== this.state;
    this.state = result.state;
    if (changed) this.revision += 1;

    return { content: result.content, details: result.details };
  }

  reconstructFromBranch<Entry>(entries: readonly Entry[]): void {
    this.state = todoStateFromBranch(entries);
    this.revision += 1;
  }
}
