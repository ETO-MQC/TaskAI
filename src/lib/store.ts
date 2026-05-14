import { create } from "zustand";
import { api } from "./api";
import type {
  AiResponse,
  DashboardStats,
  Importance,
  Priority,
  Task,
  TaskInput,
  TimerMode,
  TimerRecord,
  TimerSnapshot,
  Urgency,
} from "./types";

type View = "workbench" | "tasks" | "timer" | "calendar" | "stats" | "settings" | "ai";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  clarification?: string | null;
}

interface TaskDraft {
  title: string;
  description: string;
  priority: Priority;
  urgency: Urgency;
  importance: Importance;
  deadline: string;
  planned_date: string;
  estimated_duration: string;
  tags: string;
}

export type TaskUpdatePatch = Omit<Partial<Task>, "tags"> & { id: string; tags?: string[] | string };

interface AppStore {
  view: View;
  tasks: Task[];
  selectedTaskId: string | null;
  timer: TimerSnapshot;
  records: TimerRecord[];
  stats: DashboardStats | null;
  aiMessages: AiMessage[];
  aiOpen: boolean;
  linkPanelOpen: boolean;
  pendingRecord: TimerRecord | null;
  theme: "light" | "dark";
  setView: (view: View) => void;
  setAiOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark") => Promise<void>;
  load: () => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<Task>;
  updateTask: (patch: TaskUpdatePatch) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  startFocus: (task: Task, mode?: TimerMode) => Promise<void>;
  startTimer: (input: { topic: string; mode: TimerMode; task_id?: string | null; target_seconds?: number | null }) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  stopTimer: (taskId?: string | null, note?: string) => Promise<void>;
  confirmRecordLink: (taskId?: string | null) => Promise<void>;
  sendAi: (message: string) => Promise<AiResponse>;
  appendAiStream: (delta: string) => void;
}

const emptyTimer: TimerSnapshot = { active: false, elapsed_seconds: 0, paused: false };

function draftToInput(draft: TaskDraft): TaskInput {
  return {
    title: draft.title,
    description: draft.description,
    priority: draft.priority,
    urgency: draft.urgency,
    importance: draft.importance,
    deadline: draft.deadline || null,
    planned_date: draft.planned_date || null,
    estimated_duration: draft.estimated_duration ? Number(draft.estimated_duration) : null,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function valueString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function valueNumber(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizePriority(value: unknown): Priority | undefined {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (value === "高") return "high";
  if (value === "中") return "medium";
  if (value === "低") return "low";
  return undefined;
}

function normalizeUrgency(value: unknown): Urgency | undefined {
  if (value === "urgent" || value === "not_urgent") return value;
  if (value === "紧急") return "urgent";
  if (value === "不急" || value === "不紧急") return "not_urgent";
  return undefined;
}

function normalizeImportance(value: unknown): Importance | undefined {
  if (value === "important" || value === "not_important") return value;
  if (value === "重要") return "important";
  if (value === "不重要") return "not_important";
  return undefined;
}

function tagsFromData(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => `${item}`.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
  return undefined;
}

function taskInputFromIntentData(data: Record<string, unknown>): TaskInput {
  const title = valueString(data, ["title", "topic", "name"]);
  if (!title) throw new Error("AI create_task intent missing title");
  return {
    title,
    description: valueString(data, ["description", "note"]),
    priority: normalizePriority(data.priority),
    urgency: normalizeUrgency(data.urgency),
    importance: normalizeImportance(data.importance),
    deadline: valueString(data, ["deadline"]),
    planned_date: valueString(data, ["planned_date"]),
    estimated_duration: valueNumber(data, ["estimated_duration", "estimated_minutes", "duration"]),
    tags: tagsFromData(data.tags),
  };
}

function taskPatchFromIntentData(data: Record<string, unknown>, tasks: Task[]) {
  const id = valueString(data, ["id", "task_id"]);
  const title = valueString(data, ["title", "task_title", "name"]);
  const matched = id ? tasks.find((task) => task.id === id) : title ? tasks.find((task) => task.title.includes(title) || title.includes(task.title)) : undefined;
  if (!matched) throw new Error("AI update_task intent missing an identifiable task");
  return {
    id: matched.id,
    title: valueString(data, ["new_title"]) ?? (data.title && !data.task_title ? title ?? undefined : undefined),
    description: valueString(data, ["description", "note"]) ?? undefined,
    priority: normalizePriority(data.priority),
    urgency: normalizeUrgency(data.urgency),
    importance: normalizeImportance(data.importance),
    deadline: valueString(data, ["deadline"]) ?? undefined,
    planned_date: valueString(data, ["planned_date"]) ?? undefined,
    estimated_duration: valueNumber(data, ["estimated_duration", "estimated_minutes", "duration"]) ?? undefined,
    tags: tagsFromData(data.tags),
    status: data.status === "done" || data.status === "todo" || data.status === "archived" ? data.status : undefined,
  };
}

function summarizeAiResponse(response: AiResponse) {
  if (response.needs_clarification) return response.clarification || response.reply;
  const created = response.created_tasks?.[0];
  if (created) {
    const deadline = created.deadline ? `，截止 ${formatShortDateTime(created.deadline)}` : "";
    return `已创建任务「${created.title}」，Q${created.quadrant}${deadline}`;
  }
  if (response.updated_task) return `已更新任务「${response.updated_task.title}」。`;
  if (response.intent === "start_timer" && response.timer) return `已开始计时：${response.timer.topic ?? "专注"}`;
  if (response.intent === "stop_timer") return "已停止当前计时。";
  return response.reply;
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(5, 16);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

async function executeFrontendAiIntent(response: AiResponse) {
  if (response.needs_clarification || response.executed) return response;
  const data = (response.data ?? {}) as Record<string, unknown>;
  if (response.intent === "create_task") {
    const items = Array.isArray(response.data) ? response.data : [data];
    const created: Task[] = [];
    for (const item of items) {
      const task = await api<Task>("create_task", { input: taskInputFromIntentData(item as Record<string, unknown>) });
      created.push(task);
    }
    return { ...response, executed: true, created_tasks: created };
  }
  if (response.intent === "update_task") {
    const tasks = await api<Task[]>("list_tasks");
    const updated = await api<Task>("update_task", { patch: taskPatchFromIntentData(data, tasks) });
    return { ...response, executed: true, updated_task: updated };
  }
  if (response.intent === "start_timer") {
    const minutes = valueNumber(data, ["minutes", "estimated_duration", "estimated_minutes"]);
    const timer = await api<TimerSnapshot>("start_timer", {
      input: {
        task_id: valueString(data, ["task_id"]),
        topic: valueString(data, ["topic", "title", "task_title"]) ?? "AI Focus",
        mode: data.mode === "pomodoro" || data.mode === "countdown" ? data.mode : "positive",
        target_seconds: valueNumber(data, ["target_seconds"]) ?? (minutes ? Math.round(minutes * 60) : null),
      },
    });
    return { ...response, executed: true, timer };
  }
  if (response.intent === "stop_timer") {
    await api<TimerRecord>("stop_timer", {
      input: {
        task_id: valueString(data, ["task_id"]),
        topic: valueString(data, ["topic", "title", "task_title"]),
        note: valueString(data, ["note", "description"]),
      },
    });
    return { ...response, executed: true };
  }
  return response;
}

export const useAppStore = create<AppStore>((set, get) => ({
  view: "workbench",
  tasks: [],
  selectedTaskId: null,
  timer: emptyTimer,
  records: [],
  stats: null,
  aiMessages: [],
  aiOpen: false,
  linkPanelOpen: false,
  pendingRecord: null,
  theme: "light",
  setView: (view) => set({ view }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setTheme: async (theme) => {
    set({ theme });
    document.documentElement.classList.toggle("dark", theme === "dark");
    await api("save_setting", { key: "theme", value: theme });
  },
  load: async () => {
    const [tasks, timer, records, stats, theme] = await Promise.all([
      api<Task[]>("list_tasks"),
      api<TimerSnapshot>("get_timer_snapshot").catch(() => emptyTimer),
      api<TimerRecord[]>("list_timer_records", { task_id: null }).catch(() => []),
      api<DashboardStats>("get_dashboard_stats").catch(() => null),
      api<string | null>("get_setting", { key: "theme" }).catch(() => null),
    ]);
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", normalizedTheme === "dark");
    set({ tasks, timer, records, stats, theme: normalizedTheme });
  },
  createTask: async (draft) => {
    const task = await api<Task>("create_task", { input: draftToInput(draft) });
    await get().load();
    set({ selectedTaskId: task.id });
    return task;
  },
  updateTask: async (patch) => {
    await api<Task>("update_task", { patch });
    await get().load();
  },
  deleteTask: async (id) => {
    await api<void>("delete_task", { id });
    await get().load();
  },
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  startFocus: async (task, mode = "positive") => {
    const target_seconds =
      mode === "countdown" && task.estimated_duration ? Math.round(task.estimated_duration * 60) : null;
    await get().startTimer({ topic: task.title, task_id: task.id, mode, target_seconds });
    set({ view: "timer" });
  },
  startTimer: async (input) => {
    const timer = await api<TimerSnapshot>("start_timer", { input });
    set({ timer });
  },
  pauseTimer: async () => {
    const timer = await api<TimerSnapshot>("pause_timer");
    set({ timer });
  },
  resetTimer: async () => {
    const timer = await api<TimerSnapshot>("reset_timer");
    set({ timer, pendingRecord: null, linkPanelOpen: false });
  },
  stopTimer: async (taskId, note) => {
    const timer = get().timer;
    const record = await api<TimerRecord>("stop_timer", {
      input: { task_id: taskId ?? timer.task_id ?? null, topic: timer.topic, note },
    });
    set({ timer: emptyTimer, pendingRecord: record, linkPanelOpen: true });
    await get().load();
  },
  confirmRecordLink: async (taskId) => {
    const record = get().pendingRecord;
    if (record && taskId && record.task_id !== taskId) {
      await api<TimerRecord>("link_timer_record", {
        input: { record_id: record.id, task_id: taskId },
      }).catch(() => undefined);
    }
    set({ pendingRecord: null, linkPanelOpen: false });
    await get().load();
  },
  sendAi: async (message) => {
    set({
      aiMessages: [
        ...get().aiMessages,
        { role: "user", content: message },
        { role: "assistant", content: "" },
      ],
    });
    const response = await executeFrontendAiIntent(await api<AiResponse>("send_ai_message", { message }));
    await get().load();
    set({
      aiMessages: get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? {
              ...item,
              content: summarizeAiResponse(response),
              clarification: response.needs_clarification ? response.clarification : null,
            }
          : item,
      ),
    });
    return response;
  },
  appendAiStream: (delta) => {
    if (!delta) return;
    set({
      aiMessages: get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? { ...item, content: `${item.content}${delta}` }
          : item,
      ),
    });
  },
}));
