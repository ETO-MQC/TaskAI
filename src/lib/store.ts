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

type View = "tasks" | "timer" | "calendar" | "stats" | "settings";

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
  createTask: (draft: TaskDraft) => Promise<void>;
  updateTask: (patch: Partial<Task> & { id: string }) => Promise<void>;
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

export const useAppStore = create<AppStore>((set, get) => ({
  view: "tasks",
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
    await api<Task>("create_task", { input: draftToInput(draft) });
    await get().load();
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
    set({ timer, view: "timer" });
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
    const response = await api<AiResponse>("send_ai_message", { message });
    set({
      aiMessages: get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? {
              ...item,
              content: item.content || response.reply,
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
