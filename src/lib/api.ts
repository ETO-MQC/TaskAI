import type {
  AiResponse,
  DashboardStats,
  Task,
  TaskInput,
  TimerMode,
  TimerRecord,
  TimerSnapshot,
  Reminder,
  ReminderInput,
  Material,
  MaterialInput,
  MaterialPatch,
  PickedMaterial,
  AiConversation,
  AiConversationDetail,
  AiConversationMessage,
  AiPlanSnapshot,
} from "./types";
import { filterVisibleConversationMessages, isInternalPlanningPrompt } from "./aiHistory";
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
const reminderKey = "smartfocus.reminders";
const materialKey = "smartfocus.materials";
const aiConversationKey = "smartfocus.ai_conversations";
const aiMessageKey = "smartfocus.ai_messages_v2";
const aiPlanSnapshotKey = "smartfocus.ai_plan_snapshots";

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

function dateAt(date: Date, hour = 9, minute = 0) {
  return localDateTimeWithOffset(date, hour, minute);
}

function nextWeekday(base: Date, weekday: number, nextWeek = false) {
  const date = new Date(base);
  const current = date.getDay();
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 || nextWeek) delta += 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function fallbackInboxCapture(message: string): AiResponse {
  const raw = message.split("用户输入：").pop()?.trim() ?? message.trim();
  const nowDate = new Date();
  const today = new Date(nowDate);
  const tomorrow = new Date(nowDate); tomorrow.setDate(today.getDate() + 1);
  const afterTomorrow = new Date(nowDate); afterTomorrow.setDate(today.getDate() + 2);
  const item = {
    type: "task",
    title: raw.replace(/，.*$/, "").replace(/。$/, "") || "未命名任务",
    notes: raw,
    deadline: null as string | null,
    planned_date: null as string | null,
    reminder_at: null as string | null,
    estimated_duration: null as number | null,
    urgency: 0,
    importance: /作业|注册|提交|交/.test(raw) ? 1 : 0,
    tags: /复习|学习|单词/.test(raw) ? ["学习"] : [],
    confidence: 0.78,
    clarification_questions: [] as string[],
  };
  const explicitDate = raw.match(/(\d{1,2})月(\d{1,2})[号日]/);
  const timeMatch = raw.match(/(?:晚上|今晚)\s*(\d{1,2})\s*点|(?:上午|明早)\s*(\d{1,2})\s*点/);
  const hour = timeMatch ? Number(timeMatch[1] ?? timeMatch[2]) + (timeMatch[1] ? 12 : 0) : 9;
  if (/今天/.test(raw)) item.planned_date = localDateKey(today);
  if (/明天/.test(raw)) item.planned_date = localDateKey(tomorrow);
  if (/后天/.test(raw)) item.planned_date = localDateKey(afterTomorrow);
  if (/今晚/.test(raw)) item.planned_date = localDateKey(today);
  if (/这周五/.test(raw)) item.deadline = dateAt(nextWeekday(today, 5), 23, 59);
  if (/下周三/.test(raw)) item.deadline = dateAt(nextWeekday(today, 3, true), 23, 59);
  if (explicitDate) {
    const explicit = new Date(today.getFullYear(), Number(explicitDate[1]) - 1, Number(explicitDate[2]));
    item.deadline = dateAt(explicit, 23, 59);
  }
  if (/今晚|明早|上午|晚上/.test(raw)) {
    const basis = /明早|明天/.test(raw) ? tomorrow : today;
    if (/提醒/.test(raw)) item.reminder_at = dateAt(basis, hour, 0);
    else item.planned_date = localDateKey(basis);
  }
  const duration = raw.match(/(\d+)\s*分钟/);
  if (duration) item.estimated_duration = Number(duration[1]);
  if (/提前一天提醒|截止前一天提醒/.test(raw) && item.deadline) {
    const reminder = new Date(item.deadline);
    reminder.setDate(reminder.getDate() - 1);
    reminder.setHours(9, 0, 0, 0);
    item.reminder_at = dateAt(reminder, 9, 0);
  }
  const weekdayReminder = raw.match(/周([一二三四五六日天])(?:晚上)?提醒/);
  if (weekdayReminder) {
    const weekdayMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const reminderDay = nextWeekday(today, weekdayMap[weekdayReminder[1]]);
    item.reminder_at = dateAt(reminderDay, /晚上/.test(raw) ? 20 : 9, 0);
  }
  if (/过几天提醒/.test(raw)) item.clarification_questions.push("“过几天”还不够明确，请告诉我具体哪一天或几天后提醒。");
  if (!item.deadline && /之前|前完成|截止/.test(raw)) item.clarification_questions.push("我还需要一个明确的截止日期。");
  return {
    intent: "inbox_capture",
    action: "preview",
    data: {},
    needs_clarification: false,
    clarification: null,
    reply: JSON.stringify({ intent: "inbox_capture", items: [item], warnings: [], needs_user_confirmation: true }),
  };
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
    trashed_at: null,
    trash_reason: null,
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
    return ensureFallbackTasks().filter((task) => task.status !== "archived" && !task.trashed_at);
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
    // Legacy: soft-delete via archived status. Prefer move_task_to_trash.
    await this.update_task({ id, status: "archived" });
  }

  async move_task_to_trash(id: string, reason?: string) {
    const tasks = readJson<Task[]>(taskKey, []);
    const nowTime = now();
    const next = tasks.map((task) =>
      task.id === id ? { ...task, trashed_at: nowTime, trash_reason: reason ?? "manual", updated_at: nowTime } : task,
    );
    writeJson(taskKey, next);
    return next.find((task) => task.id === id) ?? null;
  }

  async move_tasks_to_trash(ids: string[], reason?: string) {
    const tasks = readJson<Task[]>(taskKey, []);
    const nowTime = now();
    const idSet = new Set(ids);
    const next = tasks.map((task) =>
      idSet.has(task.id) && !task.trashed_at ? { ...task, trashed_at: nowTime, trash_reason: reason ?? "batch_delete", updated_at: nowTime } : task,
    );
    writeJson(taskKey, next);
    return next.filter((task) => idSet.has(task.id));
  }

  async list_trashed_tasks() {
    return readJson<Task[]>(taskKey, []).filter((task) => task.trashed_at != null);
  }

  async restore_task_from_trash(id: string) {
    const tasks = readJson<Task[]>(taskKey, []);
    const nowTime = now();
    const next = tasks.map((task) =>
      task.id === id ? { ...task, trashed_at: null, trash_reason: null, updated_at: nowTime } : task,
    );
    writeJson(taskKey, next);
    return next.find((task) => task.id === id) ?? null;
  }

  async delete_task_permanently(id: string) {
    const tasks = readJson<Task[]>(taskKey, []);
    const task = tasks.find((t) => t.id === id);
    if (!task?.trashed_at) throw new Error("任务不在回收站中，无法彻底删除。");
    writeJson(taskKey, tasks.filter((t) => t.id !== id));
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

  async pick_material_files(): Promise<PickedMaterial[]> {
    return [];
  }

  async pick_material_folder(): Promise<PickedMaterial | null> {
    return null;
  }

  async list_materials(): Promise<Material[]> {
    return readJson<Material[]>(materialKey, []);
  }

  async create_material(input: MaterialInput): Promise<Material> {
    const materials = await this.list_materials();
    const stamp = now();
    const material: Material = {
      id: crypto.randomUUID(),
      name: input.name,
      path: input.path,
      file_type: input.file_type,
      size_bytes: input.size_bytes ?? null,
      subject: input.subject ?? null,
      exam_type: input.exam_type ?? null,
      tags: JSON.stringify(input.tags ?? []),
      note: input.note ?? null,
      status: input.status ?? "metadata_only",
      exists_on_disk: true,
      created_at: stamp,
      updated_at: stamp,
    };
    writeJson(materialKey, [material, ...materials]);
    return material;
  }

  async update_material(patch: MaterialPatch): Promise<Material> {
    const materials = await this.list_materials();
    const current = materials.find((item) => item.id === patch.id);
    if (!current) throw new Error("material not found");
    const material: Material = {
      ...current,
      subject: patch.subject ?? current.subject,
      exam_type: patch.exam_type ?? current.exam_type,
      tags: patch.tags ? JSON.stringify(patch.tags) : current.tags,
      note: patch.note ?? current.note,
      status: patch.status ?? current.status,
      updated_at: now(),
    };
    writeJson(materialKey, materials.map((item) => (item.id === patch.id ? material : item)));
    return material;
  }

  async remove_material(id: string): Promise<void> {
    writeJson(materialKey, (await this.list_materials()).filter((item) => item.id !== id));
  }

  async check_material_exists(id: string): Promise<Material> {
    const materials = await this.list_materials();
    const material = materials.find((item) => item.id === id);
    if (!material) throw new Error("material not found");
    return material;
  }

  async create_reminder(input: ReminderInput): Promise<Reminder> {
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      task_id: input.task_id ?? null,
      title: input.title,
      remind_at: input.remind_at,
      status: "pending",
      created_at: now(),
      updated_at: now(),
    };
    writeJson(reminderKey, [reminder, ...readJson<Reminder[]>(reminderKey, [])]);
    return reminder;
  }

  async list_reminders(): Promise<Reminder[]> {
    return readJson<Reminder[]>(reminderKey, []);
  }

  async trigger_due_reminders(): Promise<Reminder[]> {
    const current = readJson<Reminder[]>(reminderKey, []);
    const nowTime = Date.now();
    const next = current.map((reminder) =>
      reminder.status === "pending" && new Date(reminder.remind_at).getTime() <= nowTime
        ? { ...reminder, status: "triggered" as const, updated_at: now() }
        : reminder,
    );
    writeJson(reminderKey, next);
    return next.filter((reminder) => reminder.status === "triggered");
  }

  async dismiss_reminder(id: string): Promise<Reminder> {
    const next = readJson<Reminder[]>(reminderKey, []).map((reminder) =>
      reminder.id === id ? { ...reminder, status: "dismissed" as const, updated_at: now() } : reminder,
    );
    writeJson(reminderKey, next);
    const reminder = next.find((item) => item.id === id);
    if (!reminder) throw new Error("Reminder not found");
    return reminder;
  }

  async snooze_reminder(id: string): Promise<Reminder> {
    const next = readJson<Reminder[]>(reminderKey, []).map((reminder) => {
      if (reminder.id !== id) return reminder;
      const remindAt = new Date(reminder.remind_at);
      remindAt.setMinutes(remindAt.getMinutes() + 10);
      return { ...reminder, status: "pending" as const, remind_at: remindAt.toISOString(), updated_at: now() };
    });
    writeJson(reminderKey, next);
    const reminder = next.find((item) => item.id === id);
    if (!reminder) throw new Error("Reminder not found");
    return reminder;
  }

  async complete_reminder(id: string): Promise<Reminder> {
    const reminder = readJson<Reminder[]>(reminderKey, []).find((item) => item.id === id);
    if (!reminder) throw new Error("Reminder not found");
    if (reminder.task_id) await this.update_task({ id: reminder.task_id, status: "done" });
    return this.dismiss_reminder(id);
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

  async create_ai_conversation(input?: { title?: string | null; summary?: string | null; active_skill?: string | null }): Promise<AiConversation> {
    const conversations = readJson<AiConversation[]>(aiConversationKey, []);
    const created_at = now();
    const conversation: AiConversation = {
      id: crypto.randomUUID(),
      title: input?.title?.trim() || `未命名计划 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      summary: input?.summary ?? null,
      active_skill: input?.active_skill ?? null,
      created_at,
      updated_at: created_at,
    };
    writeJson(aiConversationKey, [conversation, ...conversations]);
    return conversation;
  }

  async list_ai_conversations(): Promise<AiConversation[]> {
    return readJson<AiConversation[]>(aiConversationKey, []).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async get_ai_conversation(id: string): Promise<AiConversationDetail> {
    const conversation = (await this.list_ai_conversations()).find((item) => item.id === id);
    if (!conversation) throw new Error("Conversation not found");
    const messages = filterVisibleConversationMessages(readJson<AiConversationMessage[]>(aiMessageKey, [])
      .filter((item) => item.conversation_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return { conversation, messages };
  }

  async update_ai_conversation_title(input: { id: string; title: string }): Promise<AiConversation> {
    const conversations = await this.list_ai_conversations();
    const updated = conversations.map((item) => item.id === input.id ? { ...item, title: input.title.trim(), updated_at: now() } : item);
    const conversation = updated.find((item) => item.id === input.id);
    if (!conversation) throw new Error("Conversation not found");
    writeJson(aiConversationKey, updated);
    return conversation;
  }

  async delete_ai_conversation(id: string): Promise<void> {
    writeJson(aiConversationKey, readJson<AiConversation[]>(aiConversationKey, []).filter((item) => item.id !== id));
    writeJson(aiMessageKey, readJson<AiConversationMessage[]>(aiMessageKey, []).filter((item) => item.conversation_id !== id));
    writeJson(aiPlanSnapshotKey, readJson<AiPlanSnapshot[]>(aiPlanSnapshotKey, []).filter((item) => item.conversation_id !== id));
  }

  async append_ai_message(input: { conversation_id: string; role: AiConversationMessage["role"]; content: string }): Promise<AiConversationMessage> {
    if (isInternalPlanningPrompt(input.content)) {
      throw new Error("internal planning prompt must not be saved as visible ai history");
    }
    const message: AiConversationMessage = {
      id: crypto.randomUUID(),
      conversation_id: input.conversation_id,
      role: input.role,
      content: input.content,
      created_at: now(),
    };
    writeJson(aiMessageKey, [...readJson<AiConversationMessage[]>(aiMessageKey, []), message]);
    const conversations = readJson<AiConversation[]>(aiConversationKey, []).map((item) =>
      item.id === input.conversation_id ? { ...item, updated_at: message.created_at } : item,
    );
    writeJson(aiConversationKey, conversations);
    return message;
  }

  async save_ai_plan_snapshot(input: { conversation_id: string; plan_json: string }): Promise<AiPlanSnapshot> {
    const snapshots = readJson<AiPlanSnapshot[]>(aiPlanSnapshotKey, []);
    const existing = snapshots.find((item) => item.conversation_id === input.conversation_id);
    const snapshot: AiPlanSnapshot = existing
      ? { ...existing, plan_json: input.plan_json, updated_at: now() }
      : { id: crypto.randomUUID(), conversation_id: input.conversation_id, plan_json: input.plan_json, created_at: now(), updated_at: now() };
    writeJson(aiPlanSnapshotKey, existing ? snapshots.map((item) => item.id === snapshot.id ? snapshot : item) : [...snapshots, snapshot]);
    return snapshot;
  }

  async get_ai_plan_snapshot(conversation_id: string): Promise<AiPlanSnapshot | null> {
    return readJson<AiPlanSnapshot[]>(aiPlanSnapshotKey, []).find((item) => item.conversation_id === conversation_id) ?? null;
  }

  async send_ai_message(message: string): Promise<AiResponse> {
    if (message.startsWith("INBOX_CAPTURE_REQUEST\n")) return fallbackInboxCapture(message);
    if (message.includes("RESCHEDULE_CONTEXT")) {
      let parsedContext: {
        current_unfinished_tasks?: Array<{ id: string; title: string; planned_date?: string | null; estimated_duration?: number | null }>;
      } = {};
      try {
        parsedContext = JSON.parse(message.split("RESCHEDULE_CONTEXT\n").pop() ?? "{}");
      } catch {
        parsedContext = {};
      }
      const first = parsedContext.current_unfinished_tasks?.[0];
      return {
        intent: "adaptive_reschedule",
        action: "preview",
        data: {},
        needs_clarification: false,
        clarification: null,
        reply: JSON.stringify({
          intent: "adaptive_reschedule",
          summary: "我先给出一版局部调整建议，等待你确认后再应用。",
          reason: "近期执行与原计划出现偏差，优先只调整受影响任务。",
          reschedule_scope: {
            mode: "partial",
            date_range: [localDateKey(), localDateKey()],
            affected_task_count: first ? 1 : 0,
            strategy: "redistribute",
          },
          suggestions: first ? [{
            type: "move_task",
            task_id: first.id,
            task_title: first.title,
            current_planned_date: first.planned_date ?? null,
            suggested_planned_date: localDateKey(),
            current_estimated_duration: first.estimated_duration ?? null,
            suggested_estimated_duration: first.estimated_duration ?? null,
            add_tags: [],
            reason: "本地演示模式下，先把最先受影响的任务纳入可确认调整。",
            risk: "low",
          }] : [],
          daily_load_after: [{
            date: localDateKey(),
            estimated_minutes: first?.estimated_duration ?? 0,
            task_count: first ? 1 : 0,
            overload: false,
          }],
          warnings: first ? [] : ["当前没有可供调整的未完成任务。"],
          needs_user_confirmation: true,
        }),
      };
    }
    if (
      /学习规划|今日计划|本周计划|期末复习|考研复习|考公备考|课程学习|资料整理|LearnKATA/.test(message)
    ) {
      return {
        intent: "learning_planning_preview",
        action: "preview",
        data: {},
        needs_clarification: false,
        clarification: null,
        reply: JSON.stringify({
          intent: "learning_planning_preview",
          summary: "已生成一份学习规划预览；当前为本地演示结果，真实 AI 会基于你的描述进一步细化。",
          goal: "先把目标拆成可执行任务，再由你确认是否写入任务列表。",
          exam_type: "custom",
          tasks: [
            {
              title: "梳理学习目标与范围",
              description: "明确考试/课程目标、日期和每天可用时间。",
              importance: 1,
              urgency: 1,
              estimated_duration: 30,
              deadline: null,
              planned_date: localDateKey(),
              tags: ["规划"],
              source_material: null,
              knowledge_points: ["目标拆解"],
            },
          ],
          events: [],
          review_plan: [],
          materials: [],
          adaptive_rules: [
            { condition: "如果某天未完成核心任务", adjustment: "自动顺延，并压缩低优先级任务。" },
          ],
          learnkata_links: [
            { knowledge_point: "目标拆解", suggested_activity: "review", note: "后续可进入 LearnKATA 做训练结构映射。" },
          ],
          warnings: ["当前仅为预览，不会自动创建任务或读取真实文件。"],
          needs_user_confirmation: true,
        }),
      };
    }
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
  if (cmd === "create_ai_conversation") return fn.call(fallback, args);
  if (cmd === "update_ai_conversation_title") return fn.call(fallback, args);
  if (cmd === "append_ai_message") return fn.call(fallback, args);
  if (cmd === "save_ai_plan_snapshot") return fn.call(fallback, args);
  if (cmd === "move_task_to_trash") return fn.call(fallback, args.id, args.reason);
  if (cmd === "move_tasks_to_trash") return fn.call(fallback, args.ids, args.reason);
  if (cmd === "restore_task_from_trash") return fn.call(fallback, args.id);
  if (cmd === "delete_task_permanently") return fn.call(fallback, args.id);
  const firstArg = Object.values(args)[0];
  return fn.call(fallback, firstArg);
}
