import type {
  AiResponse,
  DashboardStats,
  Task,
  TaskInput,
  TimerMode,
  TimerRecord,
  TimerSnapshot,
} from "./types";
import { calculateQuadrant } from "./domain";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let tauriInvoke: Invoke | null = null;

async function getInvoke(): Promise<Invoke | null> {
  if (tauriInvoke) return tauriInvoke;
  if (!("__TAURI_INTERNALS__" in window)) return null;
  try {
    const mod = await import("@tauri-apps/api/core");
    tauriInvoke = mod.invoke as Invoke;
    return tauriInvoke;
  } catch {
    return null;
  }
}

const taskKey = "smartfocus.tasks";
const recordKey = "smartfocus.timer_records";
const settingsKey = "smartfocus.settings";

const defaultShortcutSettings = {
  toggle_ai: "Ctrl+Shift+A",
  toggle_window: "Ctrl+Shift+T",
  toggle_timer: "Ctrl+Shift+S",
};

function now() {
  return new Date().toISOString();
}

function localDateKey(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeWithOffset(date: Date, hour: number, minute = 0) {
  return `${localDateKey(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

function fallbackCreateTaskIntent(message: string): AiResponse | null {
  const text = message.trim();
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (/超市|食材/.test(text)) {
    return {
      intent: "create_task",
      action: "create",
      data: {
        title: "去超市买食材",
        priority: /不急|不紧急|低优先级/.test(text) ? "low" : "medium",
        urgency: /不急|不紧急/.test(text) ? "not_urgent" : "urgent",
        importance: "not_important",
        planned_date: /明天/.test(text) ? localDateKey(tomorrow) : localDateKey(today),
        deadline: null,
        estimated_duration: null,
        tags: ["生活"],
      },
      needs_clarification: false,
      clarification: null,
      reply: `已创建任务「去超市买食材」，Q4 不重要且不紧急，计划 ${localDateKey(tomorrow)}。`,
    };
  }

  if (/周报/.test(text)) {
    return {
      intent: "create_task",
      action: "create",
      data: {
        title: "写周报",
        priority: /重要|下班前|今天/.test(text) ? "high" : "medium",
        urgency: /今天|下班前/.test(text) ? "urgent" : "not_urgent",
        importance: /重要/.test(text) ? "important" : "not_important",
        planned_date: /今天/.test(text) ? localDateKey(today) : null,
        deadline: /下班前/.test(text) ? localDateTimeWithOffset(today, 18) : null,
        estimated_duration: null,
        tags: ["工作"],
      },
      needs_clarification: false,
      clarification: null,
      reply: `已创建任务「写周报」，Q1 重要且紧急，截止 ${localDateKey(today)} 18:00。`,
    };
  }

  if (/PPT|ppt|AI|ai/.test(text) && /写|做|准备/.test(text)) {
    const nextMonday = new Date(today);
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return {
      intent: "create_task",
      action: "create",
      data: {
        title: "写 AI 相关 PPT",
        priority: "high",
        urgency: /老板|下周一|前/.test(text) ? "urgent" : "not_urgent",
        importance: /老板|重要/.test(text) ? "important" : "not_important",
        planned_date: localDateKey(nextMonday),
        deadline: /下午3点|下午三点|15/.test(text) ? localDateTimeWithOffset(nextMonday, 15) : null,
        estimated_duration: null,
        tags: ["工作", "AI"],
      },
      needs_clarification: false,
      clarification: null,
      reply: `已创建任务「写 AI 相关 PPT」，Q1 重要且紧急，截止 ${localDateKey(nextMonday)} 15:00。`,
    };
  }

  if (/创建任务$|新建任务$|鍒涘缓浠诲姟$|鏂板缓浠诲姟$/.test(text)) {
    return {
      intent: "create_task",
      action: "clarify",
      data: {},
      needs_clarification: true,
      clarification: "请告诉我要创建的任务标题。",
      reply: "请告诉我要创建的任务标题。",
    };
  }

  return null;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeTask(input: TaskInput): Task {
  const urgency = input.urgency ?? "not_urgent";
  const importance = input.importance ?? "not_important";
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description ?? "",
    priority: input.priority ?? "medium",
    urgency,
    importance,
    quadrant: calculateQuadrant(urgency, importance),
    status: input.status ?? "todo",
    deadline: input.deadline ?? null,
    estimated_duration: input.estimated_duration ?? null,
    actual_total_duration: 0,
    parent_id: input.parent_id ?? null,
    planned_date: input.planned_date ?? null,
    tags: JSON.stringify(input.tags ?? []),
    sort_order: input.sort_order ?? 0,
    created_at: now(),
    updated_at: now(),
  };
}

function ensureFallbackTasks(): Task[] {
  const existing = localStorage.getItem(taskKey);
  if (existing) return readJson<Task[]>(taskKey, []);
  const today = localDateKey();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const seeded = [
    normalizeTask({
      title: "Fallback 演示：整理今日计划",
      description: "纯前端模式下用于验证任务页和日程页 planned_date 同步。",
      priority: "high",
      urgency: "urgent",
      importance: "important",
      planned_date: today,
      estimated_duration: 45,
      tags: ["Fallback", "日程"],
    }),
    normalizeTask({
      title: "Fallback 演示：准备 AI 周报",
      description: "带 planned_date 的任务会自动出现在日程页对应日期。",
      priority: "medium",
      urgency: "not_urgent",
      importance: "important",
      planned_date: localDateKey(tomorrowDate),
      estimated_duration: 90,
      tags: ["AI", "周报"],
    }),
  ];
  writeJson(taskKey, seeded);
  return seeded;
}

class FallbackApi {
  private timer: {
    snapshot: TimerSnapshot;
    startedAt: number;
    pausedAt?: number | null;
    accumulatedPausedMs: number;
    taskId?: string | null;
    topic: string;
    mode: TimerMode;
  } | null = null;

  async list_tasks(): Promise<Task[]> {
    return ensureFallbackTasks().filter((task) => task.status !== "archived");
  }

  async create_task(input: TaskInput): Promise<Task> {
    const tasks = await this.list_tasks();
    const task = normalizeTask(input);
    writeJson(taskKey, [task, ...tasks]);
    return task;
  }

  async update_task(patch: Omit<Partial<Task>, "tags"> & { id: string; tags?: string[] | string }): Promise<Task> {
    const tasks = readJson<Task[]>(taskKey, []);
    const next = tasks.map((task) => {
      if (task.id !== patch.id) return task;
      const urgency = patch.urgency ?? task.urgency;
      const importance = patch.importance ?? task.importance;
      const tags = Array.isArray(patch.tags) ? JSON.stringify(patch.tags) : patch.tags;
      return {
        ...task,
        ...patch,
        tags: tags ?? task.tags,
        urgency,
        importance,
        quadrant: calculateQuadrant(urgency, importance),
        updated_at: now(),
      };
    });
    writeJson(taskKey, next);
    const updated = next.find((task) => task.id === patch.id);
    if (!updated) throw new Error("Task not found");
    return updated;
  }

  async delete_task(id: string) {
    await this.update_task({ id, status: "archived" });
  }

  async start_timer(input: {
    task_id?: string | null;
    topic: string;
    mode: TimerMode;
    target_seconds?: number | null;
  }): Promise<TimerSnapshot> {
    const snapshot: TimerSnapshot = {
      active: true,
      id: crypto.randomUUID(),
      task_id: input.task_id,
      topic: input.topic,
      mode: input.mode,
      elapsed_seconds: 0,
      remaining_seconds: input.target_seconds ?? null,
      target_seconds: input.target_seconds ?? null,
      paused: false,
    };
    this.timer = {
      snapshot,
      startedAt: Date.now(),
      pausedAt: null,
      accumulatedPausedMs: 0,
      taskId: input.task_id,
      topic: input.topic,
      mode: input.mode,
    };
    return snapshot;
  }

  async get_timer_snapshot(): Promise<TimerSnapshot> {
    if (!this.timer) return { active: false, elapsed_seconds: 0, paused: false };
    const end = this.timer.pausedAt ?? Date.now();
    const elapsed = Math.floor((end - this.timer.startedAt - this.timer.accumulatedPausedMs) / 1000);
    const target = this.timer.snapshot.target_seconds ?? null;
    return {
      ...this.timer.snapshot,
      elapsed_seconds: elapsed,
      remaining_seconds: target == null ? null : Math.max(0, target - elapsed),
    };
  }

  async pause_timer(): Promise<TimerSnapshot> {
    if (!this.timer) throw new Error("No active timer");
    if (this.timer.snapshot.paused) {
      this.timer.accumulatedPausedMs += Date.now() - (this.timer.pausedAt ?? Date.now());
      this.timer.pausedAt = null;
      this.timer.snapshot.paused = false;
    } else {
      this.timer.pausedAt = Date.now();
      this.timer.snapshot.paused = true;
    }
    return this.get_timer_snapshot();
  }

  async reset_timer(): Promise<TimerSnapshot> {
    this.timer = null;
    return { active: false, elapsed_seconds: 0, paused: false };
  }

  async stop_timer(input: {
    task_id?: string | null;
    topic?: string | null;
    note?: string | null;
  }): Promise<TimerRecord> {
    if (!this.timer) throw new Error("No active timer");
    const snapshot = await this.get_timer_snapshot();
    const duration = snapshot.elapsed_seconds / 60;
    const taskId = input.task_id ?? this.timer.taskId ?? null;
    const record: TimerRecord = {
      id: crypto.randomUUID(),
      task_id: taskId,
      task_topic: input.topic ?? this.timer.topic,
      mode: this.timer.mode,
      started_at: new Date(this.timer.startedAt).toISOString(),
      ended_at: now(),
      duration,
      note: input.note,
      created_at: now(),
    };
    const records = readJson<TimerRecord[]>(recordKey, []);
    writeJson(recordKey, [record, ...records]);
    if (taskId) {
      const tasks = readJson<Task[]>(taskKey, []).map((task) =>
        task.id === taskId
          ? {
              ...task,
              actual_total_duration: task.actual_total_duration + duration,
              updated_at: now(),
            }
          : task,
      );
      writeJson(taskKey, tasks);
    }
    this.timer = null;
    return record;
  }

  async list_timer_records(task_id?: string | null): Promise<TimerRecord[]> {
    const records = readJson<TimerRecord[]>(recordKey, []);
    return task_id ? records.filter((record) => record.task_id === task_id) : records;
  }

  async link_timer_record(input: { record_id: string; task_id?: string | null }): Promise<TimerRecord> {
    const records = readJson<TimerRecord[]>(recordKey, []);
    const record = records.find((item) => item.id === input.record_id);
    if (!record) throw new Error("Timer record not found");
    const nextRecord = { ...record, task_id: input.task_id ?? null };
    writeJson(
      recordKey,
      records.map((item) => (item.id === input.record_id ? nextRecord : item)),
    );
    if (input.task_id && record.task_id !== input.task_id) {
      const tasks = readJson<Task[]>(taskKey, []).map((task) =>
        task.id === input.task_id
          ? {
              ...task,
              actual_total_duration: task.actual_total_duration + record.duration,
              updated_at: now(),
            }
          : task,
      );
      writeJson(taskKey, tasks);
    }
    return nextRecord;
  }

  async save_setting(key: string, value: string) {
    const settings = readJson<Record<string, string>>(settingsKey, {});
    writeJson(settingsKey, { ...settings, [key]: value });
  }

  async get_setting(key: string): Promise<string | null> {
    return readJson<Record<string, string>>(settingsKey, {})[key] ?? null;
  }

  async get_shortcut_settings(): Promise<typeof defaultShortcutSettings> {
    const settings = readJson<Record<string, string>>(settingsKey, {});
    return {
      toggle_ai: settings.shortcut_toggle_ai ?? defaultShortcutSettings.toggle_ai,
      toggle_window: settings.shortcut_toggle_window ?? defaultShortcutSettings.toggle_window,
      toggle_timer: settings.shortcut_toggle_timer ?? defaultShortcutSettings.toggle_timer,
    };
  }

  async update_shortcut_settings(input: typeof defaultShortcutSettings): Promise<typeof defaultShortcutSettings> {
    const settings = readJson<Record<string, string>>(settingsKey, {});
    const next = {
      ...settings,
      shortcut_toggle_ai: input.toggle_ai,
      shortcut_toggle_window: input.toggle_window,
      shortcut_toggle_timer: input.toggle_timer,
    };
    writeJson(settingsKey, next);
    return input;
  }

  async get_dashboard_stats(): Promise<DashboardStats> {
    const tasks = await this.list_tasks();
    const records = await this.list_timer_records();
    const today = localDateKey();
    const todayRecords = records.filter((record) => localDateKey(record.started_at) === today);
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    const nextWeek = new Date(startOfWeek);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const startOfMonth = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), 1);
    const nextMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    const plannedDate = (task: Task) => task.planned_date ?? task.deadline;
    const inRange = (value: string | null | undefined, start: Date, end: Date) => {
      if (!value) return false;
      const date = new Date(value);
      return date >= start && date < end;
    };
    const weeklyTasks = tasks.filter((task) => task.status !== "archived" && inRange(plannedDate(task), startOfWeek, nextWeek));
    const monthlyTasks = tasks.filter((task) => task.status !== "archived" && inRange(plannedDate(task), startOfMonth, nextMonth));
    const rate = (items: Task[]) => items.length === 0 ? 0 : (items.filter((task) => task.status === "done").length / items.length) * 100;
    return {
      today_minutes: todayRecords.reduce((sum, record) => sum + record.duration, 0),
      today_timer_count: todayRecords.length,
      completed_today: tasks.filter((task) => task.status === "done" && localDateKey(task.updated_at) === today).length,
      open_tasks: tasks.filter((task) => task.status === "todo").length,
      total_tasks: tasks.length,
      weekly_completion_rate: rate(weeklyTasks),
      monthly_completion_rate: rate(monthlyTasks),
      quadrant_counts: [1, 2, 3, 4].map((quadrant) => ({
        quadrant,
        count: tasks.filter((task) => task.quadrant === quadrant).length,
      })),
      trend: Array.from({ length: 7 }).map((_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const day = localDateKey(date);
        return {
          day,
          minutes: records
            .filter((record) => localDateKey(record.started_at) === day)
            .reduce((sum, record) => sum + record.duration, 0),
        };
      }),
      ring_segments: [1, 2, 3, 4].map((quadrant) => ({
        label: `Q${quadrant}`,
        minutes: todayRecords.filter((record) => {
          const task = tasks.find((item) => item.id === record.task_id);
          return task?.quadrant === quadrant;
        }).reduce((sum, record) => sum + record.duration, 0),
        color: ["#EF4444", "#F59E0B", "#3B82F6", "#9CA3AF"][quadrant - 1],
      })),
    };
  }

  async send_ai_message(message: string): Promise<AiResponse> {
    const intent = fallbackCreateTaskIntent(message);
    if (intent) return intent;
    return {
      intent: "general_chat",
      action: "reply",
      data: {},
      needs_clarification: false,
      clarification: null,
      reply: "当前处于本地演示模式。请描述要创建、修改或计时的任务，我会按 intent 协议执行可确认的操作。",
    };
  }
}

const fallback = new FallbackApi();

export async function api<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = await getInvoke();
  if (invoke) return invoke<T>(cmd, args);
  const fn = (fallback as unknown as Record<string, (...params: unknown[]) => Promise<T>>)[cmd];
  if (!fn) throw new Error(`Fallback command not implemented: ${cmd}`);
  if (!args) return fn.call(fallback);
  if (cmd === "save_setting") return fn.call(fallback, args.key, args.value);
  if (cmd === "list_timer_records") return fn.call(fallback, args.task_id);
  const firstArg = Object.values(args)[0];
  return fn.call(fallback, firstArg);
}
