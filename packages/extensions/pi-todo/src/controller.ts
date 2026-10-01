import { applyTaskMutation, cloneState, cloneTask, emptyTodoState } from "./reducer.ts";
import { todoStateFromBranch } from "./session-state.ts";
import type {
  Task,
  TaskAction,
  TaskMutationParams,
  TaskMutationResult,
  TodoState
} from "./types.ts";

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

  apply(
    action: TaskAction,
    params: TaskMutationParams
  ): Pick<TaskMutationResult, "content" | "details"> {
    const result = applyTaskMutation(this.state, action, params);
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
