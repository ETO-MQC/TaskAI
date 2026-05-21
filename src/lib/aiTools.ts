/**
 * SmartFocus Tool Registry — Sprint 20C
 * Defines internal tools the AI can invoke through the orchestrator.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  affectedCount?: number;
}

export interface TaskDraft {
  title: string;
  description: string;
  priority: import("./types").Priority;
  urgency: import("./types").Urgency;
  importance: import("./types").Importance;
  deadline: string;
  planned_date: string;
  estimated_duration: string;
  tags: string;
}

export type TaskUpdatePatch = Omit<Partial<import("./types").Task>, "tags"> & { id: string; tags?: string[] | string };

export interface ToolContext {
  getTasks: () => import("./types").Task[];
  moveTasksToTrash: (ids: string[], reason?: string) => Promise<void>;
  moveTaskToTrash: (id: string, reason?: string) => Promise<void>;
  restoreTaskFromTrash: (id: string) => Promise<void>;
  updateTask: (patch: TaskUpdatePatch) => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<import("./types").Task>;
  createReminder: (input: import("./types").ReminderInput) => Promise<import("./types").Reminder>;
  startTimer: (input: { topic: string; mode: import("./types").TimerMode; task_id?: string | null; target_seconds?: number | null }) => Promise<void>;
  stopTimer: (taskId?: string | null, note?: string) => Promise<void>;
  load: () => Promise<void>;
  loadTrashedTasks: () => Promise<void>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

// ---------- Tool implementations ----------

const listTasksTool: ToolDefinition = {
  name: "list_tasks",
  description: "查询任务列表，支持按状态、日期、象限筛选",
  riskLevel: "low",
  requiresConfirmation: false,
  inputSchema: {
    status: "todo | done | all (default: todo)",
    planned_date: "YYYY-MM-DD filter",
    quadrant: "1-4 filter",
  },
  execute: async (params, ctx) => {
    let tasks = ctx.getTasks().filter((t) => !t.trashed_at);
    if (params.status === "todo") tasks = tasks.filter((t) => t.status === "todo");
    else if (params.status === "done") tasks = tasks.filter((t) => t.status === "done");
    if (params.planned_date) {
      const date = String(params.planned_date).slice(0, 10);
      tasks = tasks.filter((t) => t.planned_date?.slice(0, 10) === date || t.deadline?.slice(0, 10) === date);
    }
    if (params.quadrant) tasks = tasks.filter((t) => t.quadrant === Number(params.quadrant));
    return {
      success: true,
      message: `找到 ${tasks.length} 个任务`,
      data: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, planned_date: t.planned_date, quadrant: t.quadrant })),
      affectedCount: tasks.length,
    };
  },
};

const previewTasksForActionTool: ToolDefinition = {
  name: "preview_tasks_for_action",
  description: "预览将要影响的任务列表，不执行任何操作",
  riskLevel: "low",
  requiresConfirmation: false,
  inputSchema: {
    dateMode: "planned_or_deadline | created_at | all",
    dateOperator: "eq | gte",
    targetDate: "YYYY-MM-DD",
  },
  execute: async (params, ctx) => {
    const mode = (params.dateMode as string) || "planned_or_deadline";
    const op = (params.dateOperator as string) || "eq";
    const date = (params.targetDate as string) || "";
    const tasks = filterTasksByDate(ctx.getTasks(), mode as FilterMode, op as FilterOp, date);
    return {
      success: true,
      message: `找到 ${tasks.length} 个匹配任务`,
      data: tasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title, planned_date: t.planned_date, deadline: t.deadline })),
      affectedCount: tasks.length,
    };
  },
};

const moveTasksToTrashTool: ToolDefinition = {
  name: "move_tasks_to_trash",
  description: "将指定任务移动到回收站（可恢复）",
  riskLevel: "high",
  requiresConfirmation: true,
  inputSchema: {
    taskIds: "string[] — 要移动的任务 ID",
    reason: "string — 操作原因",
  },
  execute: async (params, ctx) => {
    const ids = params.taskIds as string[];
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, message: "没有指定要移动的任务。" };
    }
    await ctx.moveTasksToTrash(ids, (params.reason as string) ?? "tool_orchestrator");
    await ctx.load();
    return {
      success: true,
      message: `已将 ${ids.length} 个任务移动到回收站，可在回收站恢复。`,
      affectedCount: ids.length,
    };
  },
};

const restoreTaskFromTrashTool: ToolDefinition = {
  name: "restore_task_from_trash",
  description: "从回收站恢复任务",
  riskLevel: "medium",
  requiresConfirmation: false,
  inputSchema: {
    taskId: "string — 要恢复的任务 ID",
  },
  execute: async (params, ctx) => {
    const id = params.taskId as string;
    if (!id) return { success: false, message: "没有指定要恢复的任务。" };
    await ctx.restoreTaskFromTrash(id);
    await ctx.load();
    await ctx.loadTrashedTasks();
    return { success: true, message: "已恢复任务。" };
  },
};

const updateTaskFieldsTool: ToolDefinition = {
  name: "update_task_fields",
  description: "更新任务字段（planned_date、estimated_duration、tags、urgency、importance）",
  riskLevel: "medium",
  requiresConfirmation: false,
  inputSchema: {
    taskId: "string",
    planned_date: "YYYY-MM-DD (optional)",
    estimated_duration: "number in minutes (optional)",
    tags: "string[] (optional)",
    urgency: "urgent | not_urgent (optional)",
    importance: "important | not_important (optional)",
  },
  execute: async (params, ctx) => {
    const id = params.taskId as string;
    if (!id) return { success: false, message: "没有指定任务 ID。" };
    const patch: import("./store").TaskUpdatePatch = { id };
    if (params.planned_date != null) patch.planned_date = params.planned_date as string;
    if (params.estimated_duration != null) patch.estimated_duration = Number(params.estimated_duration);
    if (params.tags != null) patch.tags = params.tags as string[];
    if (params.urgency != null) patch.urgency = params.urgency as import("./types").Urgency;
    if (params.importance != null) patch.importance = params.importance as import("./types").Importance;
    await ctx.updateTask(patch);
    return { success: true, message: "已更新任务。" };
  },
};

const createTaskTool: ToolDefinition = {
  name: "create_task",
  description: "创建新任务",
  riskLevel: "medium",
  requiresConfirmation: false,
  inputSchema: {
    title: "string (required)",
    description: "string (optional)",
    planned_date: "YYYY-MM-DD (optional)",
    deadline: "ISO datetime (optional)",
    estimated_duration: "number in minutes (optional)",
    urgency: "urgent | not_urgent",
    importance: "important | not_important",
    tags: "string[]",
  },
  execute: async (params, ctx) => {
    const title = params.title as string;
    if (!title) return { success: false, message: "缺少任务标题。" };
    const task = await ctx.createTask({
      title,
      description: (params.description as string) ?? "",
      priority: "medium",
      urgency: (params.urgency as import("./types").Urgency) ?? "not_urgent",
      importance: (params.importance as import("./types").Importance) ?? "not_important",
      deadline: (params.deadline as string) ?? "",
      planned_date: (params.planned_date as string) ?? "",
      estimated_duration: params.estimated_duration != null ? String(params.estimated_duration) : "",
      tags: Array.isArray(params.tags) ? (params.tags as string[]).join(", ") : (params.tags as string) ?? "",
    });
    return { success: true, message: `已创建任务「${task.title}」。`, data: task };
  },
};

const createReminderTool: ToolDefinition = {
  name: "create_reminder",
  description: "创建提醒",
  riskLevel: "medium",
  requiresConfirmation: false,
  inputSchema: {
    title: "string (required)",
    remind_at: "ISO datetime (required)",
    task_id: "string (optional)",
  },
  execute: async (params, ctx) => {
    const title = params.title as string;
    const remind_at = params.remind_at as string;
    if (!title || !remind_at) return { success: false, message: "缺少标题或提醒时间。" };
    const reminder = await ctx.createReminder({
      title,
      remind_at,
      task_id: (params.task_id as string) ?? null,
    });
    return { success: true, message: `已创建提醒「${reminder.title}」。`, data: reminder };
  },
};

const startTimerTool: ToolDefinition = {
  name: "start_timer",
  description: "启动专注计时",
  riskLevel: "low",
  requiresConfirmation: false,
  inputSchema: {
    topic: "string (required)",
    mode: "positive | pomodoro | countdown",
    task_id: "string (optional)",
    target_seconds: "number (optional, for countdown/pomodoro)",
  },
  execute: async (params, ctx) => {
    await ctx.startTimer({
      topic: (params.topic as string) ?? "专注",
      mode: (params.mode as import("./types").TimerMode) ?? "positive",
      task_id: (params.task_id as string) ?? null,
      target_seconds: params.target_seconds != null ? Number(params.target_seconds) : null,
    });
    return { success: true, message: `已开始计时：${params.topic ?? "专注"}` };
  },
};

const stopTimerTool: ToolDefinition = {
  name: "stop_timer",
  description: "停止当前计时",
  riskLevel: "low",
  requiresConfirmation: false,
  inputSchema: {
    task_id: "string (optional)",
    note: "string (optional)",
  },
  execute: async (params, ctx) => {
    await ctx.stopTimer((params.task_id as string) ?? null, (params.note as string) ?? undefined);
    return { success: true, message: "已停止当前计时。" };
  },
};

const adaptiveRescheduleTool: ToolDefinition = {
  name: "adaptive_reschedule",
  description: "生成自适应排程调整建议（仅预览，不直接修改）",
  riskLevel: "low",
  requiresConfirmation: false,
  inputSchema: {
    preview_only: "boolean (default: true)",
  },
  execute: async () => {
    return {
      success: true,
      message: "调整建议需要通过 AI 生成，请使用自适应调整模式。",
    };
  },
};

// ---------- Tool Registry ----------

const toolRegistry = new Map<string, ToolDefinition>();

function register(tool: ToolDefinition) {
  toolRegistry.set(tool.name, tool);
}

register(listTasksTool);
register(previewTasksForActionTool);
register(moveTasksToTrashTool);
register(restoreTaskFromTrashTool);
register(updateTaskFieldsTool);
register(createTaskTool);
register(createReminderTool);
register(startTimerTool);
register(stopTimerTool);
register(adaptiveRescheduleTool);

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return { success: false, message: `未知工具：${toolName}。当前版本还没有这个工具。` };
  }
  return tool.execute(params, context);
}

// ---------- Shared date filtering ----------

type FilterMode = "planned_or_deadline" | "created_at" | "all";
type FilterOp = "eq" | "gte" | "lte";

export function filterTasksByDate(
  tasks: import("./types").Task[],
  mode: FilterMode,
  op: FilterOp,
  targetDate: string,
): import("./types").Task[] {
  return tasks.filter((task) => {
    if (task.status === "archived" || task.trashed_at) return false;
    if (mode === "all") return true;
    if (mode === "created_at") {
      const created = task.created_at?.slice(0, 10);
      if (!created) return false;
      if (op === "eq") return created === targetDate;
      if (op === "gte") return created >= targetDate;
      if (op === "lte") return created <= targetDate;
      return false;
    }
    // planned_or_deadline
    const dates = [task.planned_date, task.deadline].filter(Boolean).map((d) => d!.slice(0, 10));
    if (dates.length === 0) return false;
    if (op === "eq") return dates.some((d) => d === targetDate);
    if (op === "gte") return dates.some((d) => d >= targetDate);
    if (op === "lte") return dates.some((d) => d <= targetDate);
    return false;
  });
}
