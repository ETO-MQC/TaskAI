import { create } from "zustand";
import { api } from "./api";
import type {
  AiResponse,
  DashboardStats,
  Importance,
  PendingAction,
  Priority,
  Task,
  TaskInput,
  Reminder,
  ReminderInput,
  Material,
  MaterialPatch,
  AiConversation,
  AiConversationDetail,
  AiPlanSnapshot,
  TimerMode,
  TimerRecord,
  TimerSnapshot,
  Urgency,
} from "./types";
import { filterVisibleConversationMessages, isInternalPlanningPrompt } from "./aiHistory";
import { routeSmartFocusIntent, buildPendingActionFromIntent, isConfirmKeyword, isCancelKeyword, isGeneralChatIntent, type IntentResult } from "./intentRouter";
import { executeTool, type ToolContext } from "./aiTools";

type View = "workbench" | "tasks" | "timer" | "calendar" | "stats" | "settings" | "ai";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  clarification?: string | null;
}

export type AiWorkspaceEntry =
  | { id: string; role: "user" | "assistant"; kind: "message"; content: string }
  | {
      id: string;
      role: "assistant";
      kind: "inbox";
      drafts: any[];
      warnings: string[];
      results: Array<{ title: string; status: "success" | "failed"; message: string }>;
    };

type StructuredPreviewSnapshot = {
  parsed: Record<string, unknown> | null;
  raw: string;
  error: string | null;
};

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
  trashedTasks: Task[];
  trashLoading: boolean;
  trashError: string | null;
  pendingAction: PendingAction | null;
  selectedTaskId: string | null;
  timer: TimerSnapshot;
  records: TimerRecord[];
  reminders: Reminder[];
  materials: Material[];
  materialsLoading: boolean;
  materialsError: string | null;
  stats: DashboardStats | null;
  aiMessages: AiMessage[];
  conversations: AiConversation[];
  activeConversationId: string | null;
  aiWorkspaceEntries: AiWorkspaceEntry[];
  aiWorkspaceInput: string;
  aiPreferredSkill: string | null;
  aiStructuredPreview: StructuredPreviewSnapshot;
  aiPlanCanvasOpen: boolean;
  aiOpen: boolean;
  linkPanelOpen: boolean;
  pendingRecord: TimerRecord | null;
  theme: "light" | "dark";
  timerTopic: string;
  timerTaskId: string | null;
  setView: (view: View) => void;
  setAiOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark") => Promise<void>;
  setTimerContext: (topic: string, taskId: string | null) => void;
  load: () => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<Task>;
  createReminder: (input: ReminderInput) => Promise<Reminder>;
  refreshReminders: () => Promise<Reminder[]>;
  loadMaterials: () => Promise<Material[]>;
  addMaterialFiles: () => Promise<Material[]>;
  addMaterialFolder: () => Promise<Material | null>;
  createMaterial: (input: {
    name: string;
    path: string;
    file_type: string;
    size_bytes?: number | null;
    subject?: string | null;
    exam_type?: string | null;
    tags?: string[];
    note?: string | null;
    status?: Material["status"];
  }) => Promise<Material>;
  updateMaterial: (patch: MaterialPatch) => Promise<void>;
  removeMaterialRecord: (id: string) => Promise<void>;
  dismissReminder: (id: string) => Promise<void>;
  snoozeReminder: (id: string) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  updateTask: (patch: TaskUpdatePatch) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  loadTrashedTasks: () => Promise<Task[]>;
  moveTaskToTrash: (id: string, reason?: string) => Promise<void>;
  moveTasksToTrash: (ids: string[], reason?: string) => Promise<void>;
  restoreTaskFromTrash: (id: string) => Promise<void>;
  deleteTaskPermanently: (id: string) => Promise<void>;
  setPendingAction: (action: PendingAction | null) => void;
  executePendingAction: () => Promise<{ successCount: number; failCount: number; resultMsg: string } | null>;
  getPendingCandidates: () => { taskTitles: string[]; intent: string } | null;
  selectCandidate: (index: number) => Promise<string>;
  pendingCandidatesVersion: number;
  submitAiMessage: (input: string, source: "workbench" | "ai_workspace") => Promise<void>;
  selectTask: (id: string | null) => void;
  startFocus: (task: Task, mode?: TimerMode) => Promise<void>;
  startTimer: (input: { topic: string; mode: TimerMode; task_id?: string | null; target_seconds?: number | null }) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  stopTimer: (taskId?: string | null, note?: string) => Promise<void>;
  confirmRecordLink: (taskId?: string | null) => Promise<void>;
  sendAi: (message: string, source?: "workbench" | "ai_workspace") => Promise<AiResponse>;
  orchestrateAiInput: (message: string) => Promise<{ response: AiResponse | null; handled: boolean }>;
  appendAiStream: (delta: string) => void;
  setAiMessages: (messages: AiMessage[] | ((messages: AiMessage[]) => AiMessage[])) => void;
  setAiWorkspaceEntries: (entries: AiWorkspaceEntry[] | ((entries: AiWorkspaceEntry[]) => AiWorkspaceEntry[])) => void;
  setAiWorkspaceInput: (value: string) => void;
  setAiPreferredSkill: (value: string | null) => void;
  setAiStructuredPreview: (value: StructuredPreviewSnapshot) => void;
  setAiPlanCanvasOpen: (value: boolean) => void;
  loadConversations: () => Promise<AiConversation[]>;
  createConversation: (title?: string | null) => Promise<AiConversation>;
  openConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  appendAiMessage: (role: "user" | "assistant", content: string) => Promise<void>;
  saveCurrentPlanSnapshot: () => Promise<void>;
}

const emptyTimer: TimerSnapshot = { active: false, elapsed_seconds: 0, paused: false };
const aiWorkspaceStorageKey = "smartfocus_ai_workspace";
const aiMessagesStorageKey = "smartfocus_ai_messages";

let pendingCandidateSelection: {
  intent: "move_tasks_to_trash" | "shift_tasks_date" | "mark_needs_review";
  params: Record<string, unknown>;
  taskIds: string[];
  source: "workbench" | "ai_workspace";
  createdAt: number;
} | null = null;

function parseCandidateSelection(text: string, count: number): number[] | null {
  const normalized = text.trim();
  if (!normalized || count <= 0) return null;
  if (/^(全部|全选|都处理|都删|都顺延|所有)$/u.test(normalized)) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const map: Record<string, number> = { 第一个: 0, 第一: 0, 第二个: 1, 第二: 1, 第三个: 2, 第三: 2 };
  if (normalized in map && map[normalized] < count) return [map[normalized]];
  const match = normalized.match(/(?:只处理|处理|选择|选|第)?\s*(\d+)\s*(?:个|项)?/u);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < count ? [index] : null;
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persistAiWorkspace(snapshot: {
  entries: AiWorkspaceEntry[];
  input: string;
  preferredSkill: string | null;
  preview: StructuredPreviewSnapshot;
  planCanvasOpen: boolean;
}) {
  localStorage.setItem(aiWorkspaceStorageKey, JSON.stringify({
    ...snapshot,
    entries: snapshot.entries.slice(-50),
  }));
}

function persistAiMessages(messages: AiMessage[]) {
  localStorage.setItem(aiMessagesStorageKey, JSON.stringify(messages.slice(-50)));
}

function persistCurrentAiWorkspace(get: () => AppStore) {
  const state = get();
  persistAiWorkspace({
    entries: state.aiWorkspaceEntries,
    input: state.aiWorkspaceInput,
    preferredSkill: state.aiPreferredSkill,
    preview: state.aiStructuredPreview,
    planCanvasOpen: state.aiPlanCanvasOpen,
  });
}

const storedAiWorkspace = readStoredJson(aiWorkspaceStorageKey, {
  entries: [] as AiWorkspaceEntry[],
  input: "",
  preferredSkill: null as string | null,
  preview: { parsed: null, raw: "", error: null } as StructuredPreviewSnapshot,
  planCanvasOpen: false,
});
storedAiWorkspace.entries = storedAiWorkspace.entries.filter((entry) =>
  entry.kind !== "message" || !isInternalPlanningPrompt(entry.content),
);

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

function fallbackGeneralChatReply(text: string) {
  if (/你好|您好|hi|hello|hey|嗨|哈喽/.test(text.trim().toLowerCase())) {
    return "你好，我可以帮你记录任务、安排计划、调整日程，也可以协助启动和管理专注计时。";
  }
  return "我在。你可以直接告诉我要记录的任务、需要安排的计划，或哪里没完成需要调整。";
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
  if (response.intent === "learning_planning_preview") {
    const summary = (response as unknown as { summary?: string }).summary;
    return summary || "已生成学习规划预览，等待你确认是否应用为任务。";
  }
  return response.reply || "已收到 AI 响应。";
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

function localDateKeyStore(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveDateKey(ref: "today" | "yesterday" | "tomorrow" | "day_after_tomorrow" | "custom", custom?: string | null): string {
  const now = new Date();
  if (ref === "today") return localDateKeyStore(now);
  if (ref === "yesterday") { const d = new Date(now); d.setDate(d.getDate() - 1); return localDateKeyStore(d); }
  if (ref === "tomorrow") { const d = new Date(now); d.setDate(d.getDate() + 1); return localDateKeyStore(d); }
  if (ref === "day_after_tomorrow") { const d = new Date(now); d.setDate(d.getDate() + 2); return localDateKeyStore(d); }
  return custom ?? localDateKeyStore(now);
}

function resolveDeleteTasks(
  mode: "planned_or_deadline" | "created_at" | "all" | "today_view",
  dateOp: "eq" | "gte",
  targetDate: string,
  tasks: Task[],
): Task[] {
  return tasks.filter((task) => {
    if (task.status === "archived" || task.trashed_at) return false;
    if (mode === "all") return true;
    if (mode === "today_view") {
      // today_view: planned_date=today + no planned_date + important/urgent overdue
      if (task.status !== "todo") return false;
      if (task.planned_date?.slice(0, 10) === targetDate) return true;
      if (!task.planned_date) return true;
      const pd = task.planned_date.slice(0, 10);
      if (pd < targetDate && (task.importance === "important" || task.urgency === "urgent")) return true;
      return false;
    }
    if (mode === "created_at") {
      const created = task.created_at?.slice(0, 10);
      if (!created) return false;
      return dateOp === "eq" ? created === targetDate : created >= targetDate;
    }
    const dates = [task.planned_date, task.deadline].filter(Boolean).map((d) => d!.slice(0, 10));
    if (dates.length === 0) return false;
    return dateOp === "eq"
      ? dates.some((d) => d === targetDate)
      : dates.some((d) => d >= targetDate);
  });
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

function buildToolContext(get: () => AppStore): ToolContext {
  return {
    getTasks: () => get().tasks,
    moveTasksToTrash: async (ids, reason) => { await get().moveTasksToTrash(ids, reason); },
    moveTaskToTrash: async (id, reason) => { await get().moveTaskToTrash(id, reason); },
    restoreTaskFromTrash: async (id) => { await get().restoreTaskFromTrash(id); },
    updateTask: async (patch) => { await get().updateTask(patch); },
    createTask: (draft) => get().createTask(draft),
    createReminder: (input) => get().createReminder(input),
    startTimer: async (input) => { await get().startTimer(input); },
    stopTimer: async (taskId, note) => { await get().stopTimer(taskId, note); },
    load: async () => { await get().load(); },
    loadTrashedTasks: async () => { await get().loadTrashedTasks(); },
  };
}

function buildIntentFromSelection(selection: NonNullable<typeof pendingCandidateSelection>, chosenIds: string[]): IntentResult {
  return {
    intent: selection.intent,
    confidence: 0.95,
    params: { ...selection.params, matchedTaskIds: chosenIds, resolverStatus: "matched" },
    missingFields: [],
    riskLevel: selection.intent === "move_tasks_to_trash" ? "high" : selection.intent === "shift_tasks_date" ? "medium" : "low",
    needsClarification: false,
  };
}

export const useAppStore = create<AppStore>((set, get) => ({
  view: "workbench",
  tasks: [],
  trashedTasks: [],
  trashLoading: false,
  trashError: null,
  pendingAction: null,
  selectedTaskId: null,
  timer: emptyTimer,
  records: [],
  reminders: [],
  materials: [],
  materialsLoading: false,
  materialsError: null,
  stats: null,
  aiMessages: readStoredJson<AiMessage[]>(aiMessagesStorageKey, [])
    .filter((message) => !isInternalPlanningPrompt(message.content))
    .slice(-50),
  conversations: [],
  activeConversationId: null,
  aiWorkspaceEntries: storedAiWorkspace.entries.slice(-50),
  aiWorkspaceInput: storedAiWorkspace.input,
  aiPreferredSkill: storedAiWorkspace.preferredSkill,
  aiStructuredPreview: storedAiWorkspace.preview,
  aiPlanCanvasOpen: storedAiWorkspace.planCanvasOpen,
  aiOpen: false,
  linkPanelOpen: false,
  pendingRecord: null,
  theme: "light",
  timerTopic: "自由专注",
  timerTaskId: null,
  setView: (view) => set({ view }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setTheme: async (theme) => {
    set({ theme });
    document.documentElement.classList.toggle("dark", theme === "dark");
    await api("save_setting", { key: "theme", value: theme });
  },
  setTimerContext: (timerTopic, timerTaskId) => set({ timerTopic, timerTaskId }),
  load: async () => {
    const [tasks, timer, records, reminders, materials, stats, theme] = await Promise.all([
      api<Task[]>("list_tasks"),
      api<TimerSnapshot>("get_timer_snapshot").catch(() => emptyTimer),
      api<TimerRecord[]>("list_timer_records", { task_id: null }).catch(() => []),
      api<Reminder[]>("list_reminders").catch(() => []),
      api<Material[]>("list_materials").catch(() => []),
      api<DashboardStats>("get_dashboard_stats").catch(() => null),
      api<string | null>("get_setting", { key: "theme" }).catch(() => null),
    ]);
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", normalizedTheme === "dark");
    set({ tasks, timer, records, reminders, materials, stats, theme: normalizedTheme });
    await get().loadConversations();
  },
  createTask: async (draft) => {
    const task = await api<Task>("create_task", { input: draftToInput(draft) });
    await get().load();
    set({ selectedTaskId: task.id });
    return task;
  },
  createReminder: async (input) => {
    const reminder = await api<Reminder>("create_reminder", { input });
    await get().refreshReminders();
    return reminder;
  },
  refreshReminders: async () => {
    const reminders = await api<Reminder[]>("list_reminders");
    set({ reminders });
    return reminders;
  },
  loadMaterials: async () => {
    set({ materialsLoading: true, materialsError: null });
    try {
      const materials = await api<Material[]>("list_materials");
      set({ materials, materialsLoading: false });
      return materials;
    } catch (error) {
      const materialsError = error instanceof Error ? error.message : "资料加载失败";
      set({ materialsLoading: false, materialsError });
      return [];
    }
  },
  addMaterialFiles: async () => {
    set({ materialsLoading: true, materialsError: null });
    try {
      const picked = await api<Array<{ name: string; path: string; file_type: string; size_bytes?: number | null }>>("pick_material_files");
      const created = await Promise.all(
        picked.map((item) => api<Material>("create_material", { input: { ...item, status: "metadata_only" } })),
      );
      await get().loadMaterials();
      return created;
    } catch (error) {
      const materialsError = error instanceof Error ? error.message : "添加文件失败";
      set({ materialsLoading: false, materialsError });
      return [];
    }
  },
  addMaterialFolder: async () => {
    set({ materialsLoading: true, materialsError: null });
    try {
      const picked = await api<{ name: string; path: string; file_type: string; size_bytes?: number | null } | null>("pick_material_folder");
      if (!picked) {
        set({ materialsLoading: false });
        return null;
      }
      const material = await api<Material>("create_material", { input: { ...picked, status: "metadata_only" } });
      await get().loadMaterials();
      return material;
    } catch (error) {
      const materialsError = error instanceof Error ? error.message : "添加文件夹失败";
      set({ materialsLoading: false, materialsError });
      return null;
    }
  },
  createMaterial: async (input) => {
    const material = await api<Material>("create_material", { input });
    await get().loadMaterials();
    return material;
  },
  updateMaterial: async (patch) => {
    await api<Material>("update_material", { patch });
    await get().loadMaterials();
  },
  removeMaterialRecord: async (id) => {
    await api<void>("remove_material", { id });
    await get().loadMaterials();
  },
  dismissReminder: async (id) => {
    await api<Reminder>("dismiss_reminder", { id });
    await get().refreshReminders();
  },
  snoozeReminder: async (id) => {
    await api<Reminder>("snooze_reminder", { id });
    await get().refreshReminders();
  },
  completeReminder: async (id) => {
    await api<Reminder>("complete_reminder", { id });
    await get().load();
  },
  updateTask: async (patch) => {
    await api<Task>("update_task", { patch });
    await get().load();
  },
  deleteTask: async (id) => {
    // Default delete moves to trash instead of hard delete
    await api<void>("move_task_to_trash", { id, reason: "manual" });
    await get().load();
  },
  loadTrashedTasks: async () => {
    set({ trashLoading: true, trashError: null });
    try {
      const trashedTasks = await api<Task[]>("list_trashed_tasks");
      set({ trashedTasks, trashLoading: false });
      return trashedTasks;
    } catch (error) {
      const trashError = error instanceof Error ? error.message : "回收站加载失败";
      set({ trashLoading: false, trashError });
      return [];
    }
  },
  moveTaskToTrash: async (id, reason = "manual") => {
    await api<Task>("move_task_to_trash", { id, reason });
    await get().load();
  },
  moveTasksToTrash: async (ids, reason = "batch_delete") => {
    await api<Task[]>("move_tasks_to_trash", { ids, reason });
    await get().load();
  },
  restoreTaskFromTrash: async (id) => {
    await api<Task>("restore_task_from_trash", { id });
    await get().load();
    await get().loadTrashedTasks();
  },
  deleteTaskPermanently: async (id) => {
    await api<void>("delete_task_permanently", { id });
    await get().loadTrashedTasks();
  },
  setPendingAction: (pendingAction) => set({ pendingAction }),
  pendingCandidatesVersion: 0,
  getPendingCandidates: () => {
    if (!pendingCandidateSelection) return null;
    const tasks = get().tasks;
    const taskTitles = pendingCandidateSelection.taskIds.map((id) => {
      const task = tasks.find((t) => t.id === id);
      return task?.title ?? id;
    });
    return { taskTitles, intent: pendingCandidateSelection.intent };
  },
  selectCandidate: async (index) => {
    const sel = pendingCandidateSelection;
    if (!sel || index < 0 || index >= sel.taskIds.length) {
      return "选择无效，请重新选择。";
    }
    const chosenIds = [sel.taskIds[index]];
    const selectedIntent = buildIntentFromSelection(sel, chosenIds);
    const action = buildPendingActionFromIntent(selectedIntent, get().tasks, sel.source);
    pendingCandidateSelection = null;
    if (!action) {
      return "没有找到符合条件的任务。";
    }
    set({ pendingAction: action });
    return `${action.summary}\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t) => `• ${t}`).join("\n")}`;
  },
  executePendingAction: async () => {
    const action = get().pendingAction;
    if (!action) return null;
    set({ pendingAction: null });

    if (action.type === "batch_delete") {
      const ids = action.taskIds.length > 0
        ? action.taskIds
        : resolveDeleteTasks(
            (action.params.dateMode as string ?? "planned_or_deadline") as "planned_or_deadline" | "created_at" | "all",
            (action.params.dateOperator as string ?? "eq") as "eq" | "gte",
            (action.params.targetDate as string) ?? localDateKeyStore(),
            get().tasks,
          ).map((t) => t.id);

      let successCount = 0;
      let failCount = 0;
      const failures: string[] = [];
      for (const id of ids) {
        try {
          await api<Task>("move_task_to_trash", { id, reason: action.params.reason as string ?? "batch_delete" });
          successCount++;
        } catch (error) {
          failCount++;
          failures.push(error instanceof Error ? error.message : "未知错误");
        }
      }
      await get().load();
      const resultMsg = [
        `已将 ${successCount} 个任务移动到回收站，可在回收站恢复`,
        failCount > 0 ? `，失败 ${failCount} 个` : "",
      ].join("");
      return { successCount, failCount, resultMsg };
    }

    if (action.type === "shift_tasks_date") {
      const ids = action.taskIds;
      const shiftDays = Number(action.params.shiftDays) || 1;
      const toolCtx = buildToolContext(get);
      const result = await executeTool("shift_tasks_date", { taskIds: ids, shiftDays }, toolCtx);
      return { successCount: result.affectedCount ?? 0, failCount: ids.length - (result.affectedCount ?? 0), resultMsg: result.message };
    }

    if (action.type === "mark_needs_review") {
      const ids = action.taskIds;
      const toolCtx = buildToolContext(get);
      const result = await executeTool("mark_needs_review", { taskIds: ids }, toolCtx);
      return { successCount: result.affectedCount ?? 0, failCount: ids.length - (result.affectedCount ?? 0), resultMsg: result.message };
    }

    if (action.type === "batch_update") {
      return { successCount: 0, failCount: 0, resultMsg: "批量修改需要更具体的指令，请指明要修改哪些任务和具体修改内容。" };
    }

    return { successCount: 0, failCount: 0, resultMsg: `已确认执行「${action.summary}」，但当前操作类型未绑定执行器。` };
  },
  submitAiMessage: async (input, source) => {
    // This is a unified AI input handler used by both Workbench and AI Workspace
    // The actual execution is handled by the component that calls this,
    // since the UI rendering differs between embedded and standalone modes.
    // This function just validates and dispatches.
    const text = input.trim();
    if (!text) return;
    // Actual submission logic is delegated to the calling component
  },
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  startFocus: async (task, mode = "positive") => {
    const target_seconds =
      mode === "countdown" && task.estimated_duration ? Math.round(task.estimated_duration * 60) : null;
    await get().startTimer({ topic: task.title, task_id: task.id, mode, target_seconds });
    set({ view: "timer", timerTopic: task.title, timerTaskId: task.id });
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
  sendAi: async (message, source) => {
    const text = message.trim();
    const src = source ?? "workbench";
    const pendingAction = get().pendingAction;

    // --- Step 1: PendingAction confirm/cancel ---
    if (pendingAction && isConfirmKeyword(text)) {
      const result = await get().executePendingAction();
      const reply = result?.resultMsg ?? "已确认执行。";
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "tool_executed", action: "confirm_pending", data: {}, needs_clarification: false, clarification: null, reply };
    }
    if (pendingAction && isCancelKeyword(text)) {
      set({ pendingAction: null });
      const reply = "已取消当前待确认操作。";
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "general_chat", action: "cancel_pending", data: {}, needs_clarification: false, clarification: null, reply };
    }

    if (pendingCandidateSelection && pendingCandidateSelection.source === src && Date.now() - pendingCandidateSelection.createdAt < 5 * 60 * 1000) {
      const selectedIndexes = parseCandidateSelection(text, pendingCandidateSelection.taskIds.length);
      if (selectedIndexes) {
        const selection = pendingCandidateSelection;
        pendingCandidateSelection = null;
      set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
        const chosenIds = selectedIndexes.map((index) => selection.taskIds[index]).filter(Boolean);
        const selectedIntent = buildIntentFromSelection(selection, chosenIds);
        const action = buildPendingActionFromIntent(selectedIntent, get().tasks, src);
        const reply = action
          ? `${action.summary}\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((title) => `• ${title}`).join("\n")}\n\n请回复「确认」执行，或「取消」放弃。`
          : "没有找到符合条件的任务。";
        if (action) set({ pendingAction: action });
        if (src === "workbench") {
          const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
          set({ aiMessages: nextMessages });
          persistAiMessages(nextMessages);
        }
        return { intent: selection.intent, action: action ? "pending_confirmation" : "no_match", data: action?.params ?? {}, needs_clarification: false, clarification: null, reply };
      }
    }

    // --- Step 2: Intent routing ---
    const intentResult = routeSmartFocusIntent(text, { tasks: get().tasks });
    const routedAmbiguousTaskIds = intentResult.params.ambiguousTaskIds as string[] | undefined;
    if (intentResult.needsClarification && routedAmbiguousTaskIds?.length && (
      intentResult.intent === "move_tasks_to_trash" || intentResult.intent === "shift_tasks_date" || intentResult.intent === "mark_needs_review"
    )) {
      pendingCandidateSelection = { intent: intentResult.intent, params: intentResult.params, taskIds: routedAmbiguousTaskIds, source: src, createdAt: Date.now() };
      set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
    }

    // --- Step 3: High-confidence tool intents ---
    if (intentResult.intent === "move_tasks_to_trash" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, src);
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0
          ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}`
          : "";
        const reply = `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。`;
        if (src === "workbench") {
          const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
          set({ aiMessages: nextMessages });
          persistAiMessages(nextMessages);
        }
        return { intent: "move_tasks_to_trash", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply };
      }
      const reply = intentResult.clarificationQuestion ?? "没有找到符合条件的任务。";
      const ambiguousTaskIds = intentResult.params.ambiguousTaskIds as string[] | undefined;
      if (ambiguousTaskIds?.length) {
        pendingCandidateSelection = { intent: "move_tasks_to_trash", params: intentResult.params, taskIds: ambiguousTaskIds, source: src, createdAt: Date.now() };
        set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
      }
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "move_tasks_to_trash", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply };
    }

    // Needs clarification for delete intent
    if (intentResult.intent === "move_tasks_to_trash" && intentResult.needsClarification) {
      const reply = intentResult.clarificationQuestion ?? "请说明要删除哪些任务。";
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "move_tasks_to_trash", action: "clarify", data: {}, needs_clarification: true, clarification: reply, reply };
    }

    // Shift tasks date
    if (intentResult.intent === "shift_tasks_date" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, src);
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0
          ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}`
          : "";
        const reply = `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。`;
        if (src === "workbench") {
          const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
          set({ aiMessages: nextMessages });
          persistAiMessages(nextMessages);
        }
        return { intent: "shift_tasks_date", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply };
      }
      const reply = intentResult.clarificationQuestion ?? "没有找到符合条件的任务。";
      const ambiguousTaskIds = intentResult.params.ambiguousTaskIds as string[] | undefined;
      if (ambiguousTaskIds?.length) {
        pendingCandidateSelection = { intent: "shift_tasks_date", params: intentResult.params, taskIds: ambiguousTaskIds, source: src, createdAt: Date.now() };
        set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
      }
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "shift_tasks_date", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply };
    }

    // Shift needs clarification
    if (intentResult.intent === "shift_tasks_date" && intentResult.needsClarification) {
      const reply = intentResult.clarificationQuestion ?? "请说明要顺延哪些任务。";
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "shift_tasks_date", action: "clarify", data: {}, needs_clarification: true, clarification: reply, reply };
    }

    // Mark needs review
    if (intentResult.intent === "mark_needs_review" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, src);
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0
          ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}`
          : "";
        const reply = `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。`;
        if (src === "workbench") {
          const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
          set({ aiMessages: nextMessages });
          persistAiMessages(nextMessages);
        }
        return { intent: "mark_needs_review", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply };
      }
      // If action is null (no matched tasks), execute directly without confirmation
      const toolCtx = buildToolContext(get);
      const ids = (intentResult.params.matchedTaskIds as string[]) ?? [];
      if (ids.length === 0) {
        const reply = "没有找到符合条件的任务。";
        if (src === "workbench") {
          const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: reply } as AiMessage].slice(-50);
          set({ aiMessages: nextMessages });
          persistAiMessages(nextMessages);
        }
        return { intent: "mark_needs_review", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply };
      }
      const result = await executeTool("mark_needs_review", { taskIds: ids }, toolCtx);
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: result.message } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "mark_needs_review", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message };
    }

    // --- Step 4: Direct tool execution (non-delete, no confirmation needed) ---
    if (intentResult.intent === "create_task" && intentResult.confidence >= 0.8) {
      const toolCtx = buildToolContext(get);
      const result = await executeTool("create_task", { title: text.replace(/帮我记|创建任务|记一下|帮我创建|新建任务|加一个任务|添加任务/g, "").trim() || text, ...intentResult.params }, toolCtx);
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: result.message } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "create_task", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message };
    }
    if (intentResult.intent === "stop_timer" && intentResult.confidence >= 0.8) {
      const toolCtx = buildToolContext(get);
      const result = await executeTool("stop_timer", intentResult.params, toolCtx);
      if (src === "workbench") {
        const nextMessages = [...get().aiMessages, { role: "user", content: text } as AiMessage, { role: "assistant", content: result.message } as AiMessage].slice(-50);
        set({ aiMessages: nextMessages });
        persistAiMessages(nextMessages);
      }
      return { intent: "stop_timer", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message };
    }

    // --- Step 5: Backend delegation (chat, planning, etc.) ---
    if (src === "workbench") {
      const nextMessages = [...get().aiMessages, { role: "user", content: message } as AiMessage, { role: "assistant", content: "" } as AiMessage].slice(-50);
      set({ aiMessages: nextMessages });
      persistAiMessages(nextMessages);
    }
    const response = await executeFrontendAiIntent(await api<AiResponse>("send_ai_message", { message }));
    await get().load();
    if (src === "workbench") {
      const updatedMessages = get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? { ...item, content: summarizeAiResponse(response), clarification: response.needs_clarification ? response.clarification : null }
          : item,
      );
      set({ aiMessages: updatedMessages });
      persistAiMessages(updatedMessages);
    }
    return response;
  },
  orchestrateAiInput: async (message) => {
    const text = message.trim();
    const pendingAction = get().pendingAction;

    // Confirm
    if (pendingAction && isConfirmKeyword(text)) {
      const result = await get().executePendingAction();
      return { response: { intent: "tool_executed", action: "confirm_pending", data: {}, needs_clarification: false, clarification: null, reply: result?.resultMsg ?? "已确认执行。" }, handled: true };
    }
    // Cancel
    if (pendingAction && isCancelKeyword(text)) {
      set({ pendingAction: null });
      return { response: { intent: "general_chat", action: "cancel_pending", data: {}, needs_clarification: false, clarification: null, reply: "已取消当前待确认操作。" }, handled: true };
    }

    if (pendingCandidateSelection && pendingCandidateSelection.source === "ai_workspace" && Date.now() - pendingCandidateSelection.createdAt < 5 * 60 * 1000) {
      const selectedIndexes = parseCandidateSelection(text, pendingCandidateSelection.taskIds.length);
      if (selectedIndexes) {
        const selection = pendingCandidateSelection;
        pendingCandidateSelection = null;
      set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
        const chosenIds = selectedIndexes.map((index) => selection.taskIds[index]).filter(Boolean);
        const selectedIntent = buildIntentFromSelection(selection, chosenIds);
        const action = buildPendingActionFromIntent(selectedIntent, get().tasks, "ai_workspace");
        const reply = action
          ? `${action.summary}\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((title) => `• ${title}`).join("\n")}\n\n请回复「确认」执行，或「取消」放弃。`
          : "没有找到符合条件的任务。";
        if (action) set({ pendingAction: action });
        return { response: { intent: selection.intent, action: action ? "pending_confirmation" : "no_match", data: action?.params ?? {}, needs_clarification: false, clarification: null, reply }, handled: true };
      }
    }

    const intentResult = routeSmartFocusIntent(text, { tasks: get().tasks });
    const routedAmbiguousTaskIds = intentResult.params.ambiguousTaskIds as string[] | undefined;
    if (intentResult.needsClarification && routedAmbiguousTaskIds?.length && (
      intentResult.intent === "move_tasks_to_trash" || intentResult.intent === "shift_tasks_date" || intentResult.intent === "mark_needs_review"
    )) {
      pendingCandidateSelection = { intent: intentResult.intent, params: intentResult.params, taskIds: routedAmbiguousTaskIds, source: "ai_workspace", createdAt: Date.now() };
      set((s) => ({ pendingCandidatesVersion: s.pendingCandidatesVersion + 1 }));
    }

    // Delete → pendingAction
    if (intentResult.intent === "move_tasks_to_trash" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, "ai_workspace");
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0 ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}` : "";
        return { response: { intent: "move_tasks_to_trash", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply: `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。` }, handled: true };
      }
      return { response: { intent: "move_tasks_to_trash", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply: intentResult.clarificationQuestion ?? "没有找到符合条件的任务。" }, handled: true };
    }
    if (intentResult.intent === "move_tasks_to_trash" && intentResult.needsClarification) {
      return { response: { intent: "move_tasks_to_trash", action: "clarify", data: {}, needs_clarification: true, clarification: intentResult.clarificationQuestion ?? "请说明要删除哪些任务。", reply: intentResult.clarificationQuestion ?? "请说明要删除哪些任务。" }, handled: true };
    }

    // Shift tasks date → pendingAction
    if (intentResult.intent === "shift_tasks_date" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, "ai_workspace");
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0 ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}` : "";
        return { response: { intent: "shift_tasks_date", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply: `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。` }, handled: true };
      }
      return { response: { intent: "shift_tasks_date", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply: intentResult.clarificationQuestion ?? "没有找到符合条件的任务。" }, handled: true };
    }
    if (intentResult.intent === "shift_tasks_date" && intentResult.needsClarification) {
      return { response: { intent: "shift_tasks_date", action: "clarify", data: {}, needs_clarification: true, clarification: intentResult.clarificationQuestion ?? "请说明要顺延哪些任务。", reply: intentResult.clarificationQuestion ?? "请说明要顺延哪些任务。" }, handled: true };
    }

    // Mark needs review → direct or pending
    if (intentResult.intent === "mark_needs_review" && !intentResult.needsClarification) {
      const action = buildPendingActionFromIntent(intentResult, get().tasks, "ai_workspace");
      if (action) {
        set({ pendingAction: action });
        const previewText = action.affectedPreview.length > 0 ? `\n\n影响任务（前 ${action.affectedPreview.length} 个）：\n${action.affectedPreview.map((t: string) => `• ${t}`).join("\n")}` : "";
        return { response: { intent: "mark_needs_review", action: "pending_confirmation", data: action.params, needs_clarification: false, clarification: null, reply: `${action.summary}${previewText}\n\n请回复「确认」执行，或「取消」放弃。` }, handled: true };
      }
      const toolCtx = buildToolContext(get);
      const ids = (intentResult.params.matchedTaskIds as string[]) ?? [];
      if (ids.length === 0) {
        return { response: { intent: "mark_needs_review", action: "no_match", data: {}, needs_clarification: false, clarification: null, reply: "没有找到符合条件的任务。" }, handled: true };
      }
      const result = await executeTool("mark_needs_review", { taskIds: ids }, toolCtx);
      return { response: { intent: "mark_needs_review", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message }, handled: true };
    }

    // Direct tool execution
    if (intentResult.intent === "create_task" && intentResult.confidence >= 0.8) {
      const toolCtx = buildToolContext(get);
      const result = await executeTool("create_task", { title: text.replace(/帮我记|创建任务|记一下|帮我创建|新建任务|加一个任务|添加任务/g, "").trim() || text }, toolCtx);
      return { response: { intent: "create_task", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message }, handled: true };
    }
    if (intentResult.intent === "stop_timer" && intentResult.confidence >= 0.8) {
      const toolCtx = buildToolContext(get);
      const result = await executeTool("stop_timer", intentResult.params, toolCtx);
      return { response: { intent: "stop_timer", action: "tool_executed", data: {}, needs_clarification: false, clarification: null, reply: result.message }, handled: true };
    }

    // General chat → local reply
    if (intentResult.intent === "chat" && intentResult.confidence >= 0.8) {
      return { response: { intent: "general_chat", action: "reply", data: {}, needs_clarification: false, clarification: null, reply: fallbackGeneralChatReply(text) }, handled: true };
    }

    // Not handled by orchestrator — caller should delegate to backend
    return { response: null, handled: false };
  },
  appendAiStream: (delta) => {
    if (!delta) return;
    const updatedMessages = get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? { ...item, content: `${item.content}${delta}` }
          : item,
      );
    set({ aiMessages: updatedMessages });
    persistAiMessages(updatedMessages);
  },
  setAiMessages: (value) => {
    const messages = typeof value === "function" ? value(get().aiMessages) : value;
    const sliced = messages.slice(-50);
    set({ aiMessages: sliced });
    persistAiMessages(sliced);
  },
  setAiWorkspaceEntries: (value) => {
    const entries = typeof value === "function" ? value(get().aiWorkspaceEntries) : value;
    const sliced = entries.slice(-50);
    set({ aiWorkspaceEntries: sliced });
    persistAiWorkspace({
      entries: sliced,
      input: get().aiWorkspaceInput,
      preferredSkill: get().aiPreferredSkill,
      preview: get().aiStructuredPreview,
      planCanvasOpen: get().aiPlanCanvasOpen,
    });
  },
  setAiWorkspaceInput: (aiWorkspaceInput) => {
    set({ aiWorkspaceInput });
    persistAiWorkspace({
      entries: get().aiWorkspaceEntries,
      input: aiWorkspaceInput,
      preferredSkill: get().aiPreferredSkill,
      preview: get().aiStructuredPreview,
      planCanvasOpen: get().aiPlanCanvasOpen,
    });
  },
  setAiPreferredSkill: (aiPreferredSkill) => {
    set({ aiPreferredSkill });
    persistAiWorkspace({
      entries: get().aiWorkspaceEntries,
      input: get().aiWorkspaceInput,
      preferredSkill: aiPreferredSkill,
      preview: get().aiStructuredPreview,
      planCanvasOpen: get().aiPlanCanvasOpen,
    });
  },
  setAiStructuredPreview: (aiStructuredPreview) => {
    set({ aiStructuredPreview });
    persistAiWorkspace({
      entries: get().aiWorkspaceEntries,
      input: get().aiWorkspaceInput,
      preferredSkill: get().aiPreferredSkill,
      preview: aiStructuredPreview,
      planCanvasOpen: get().aiPlanCanvasOpen,
    });
  },
  setAiPlanCanvasOpen: (aiPlanCanvasOpen) => {
    set({ aiPlanCanvasOpen });
    persistAiWorkspace({
      entries: get().aiWorkspaceEntries,
      input: get().aiWorkspaceInput,
      preferredSkill: get().aiPreferredSkill,
      preview: get().aiStructuredPreview,
      planCanvasOpen: aiPlanCanvasOpen,
    });
  },
  loadConversations: async () => {
    const conversations = await api<AiConversation[]>("list_ai_conversations").catch(() => []);
    set({ conversations });
    if (!get().activeConversationId && conversations[0]) {
      await get().openConversation(conversations[0].id);
    }
    return conversations;
  },
  createConversation: async (title) => {
    // Clear high-risk pendingAction when creating new conversation
    const currentPending = get().pendingAction;
    if (currentPending && currentPending.riskLevel === "high") {
      set({ pendingAction: null });
    }
    // Save current conversation state before creating new
    const prevId = get().activeConversationId;
    if (prevId) {
      const parsed = get().aiStructuredPreview.parsed;
      if (parsed) {
        await api<AiPlanSnapshot>("save_ai_plan_snapshot", {
          conversation_id: prevId,
          plan_json: JSON.stringify(parsed),
        }).catch(() => undefined);
      }
      persistCurrentAiWorkspace(get);
    }
    const conversation = await api<AiConversation>("create_ai_conversation", {
      title: title ?? null,
      summary: null,
      active_skill: get().aiPreferredSkill,
    });
    set((state) => ({
      conversations: [conversation, ...state.conversations.filter((item) => item.id !== conversation.id)],
      activeConversationId: conversation.id,
      aiWorkspaceEntries: [],
      aiWorkspaceInput: "",
      aiStructuredPreview: { parsed: null, raw: "", error: null },
    }));
    persistCurrentAiWorkspace(get);
    return conversation;
  },
  openConversation: async (id) => {
    // Save current conversation state before switching
    const prevId = get().activeConversationId;
    if (prevId) {
      const parsed = get().aiStructuredPreview.parsed;
      if (parsed) {
        await api<AiPlanSnapshot>("save_ai_plan_snapshot", {
          conversation_id: prevId,
          plan_json: JSON.stringify(parsed),
        }).catch(() => undefined);
      }
      persistCurrentAiWorkspace(get);
    }
    const detail = await api<AiConversationDetail>("get_ai_conversation", { id });
    const snapshot = await api<AiPlanSnapshot | null>("get_ai_plan_snapshot", { conversation_id: id }).catch(() => null);
    let preview: StructuredPreviewSnapshot = { parsed: null, raw: "", error: null };
    if (snapshot?.plan_json) {
      try {
        const parsed = JSON.parse(snapshot.plan_json) as Record<string, unknown>;
        preview = { parsed, raw: snapshot.plan_json, error: null };
      } catch {
        preview = { parsed: null, raw: snapshot.plan_json, error: "计划快照解析失败" };
      }
    }
    const entries = filterVisibleConversationMessages(detail.messages)
      .map((message) => ({
        id: message.id,
        role: message.role as "user" | "assistant",
        kind: "message" as const,
        content: message.content,
      }))
      .slice(-50);
    set({
      activeConversationId: id,
      aiWorkspaceEntries: entries,
      aiPreferredSkill: detail.conversation.active_skill ?? null,
      aiStructuredPreview: preview,
      aiPlanCanvasOpen: false,
    });
    persistCurrentAiWorkspace(get);
  },
  renameConversation: async (id, title) => {
    const updated = await api<AiConversation>("update_ai_conversation_title", { id, title });
    set((state) => ({ conversations: state.conversations.map((item) => item.id === id ? updated : item) }));
  },
  deleteConversation: async (id) => {
    await api<void>("delete_ai_conversation", { id });
    const conversations = get().conversations.filter((item) => item.id !== id);
    set({ conversations });
    persistCurrentAiWorkspace(get);
    if (get().activeConversationId === id) {
      if (conversations[0]) await get().openConversation(conversations[0].id);
      else set({
        activeConversationId: null,
        aiWorkspaceEntries: [],
        aiWorkspaceInput: "",
        aiStructuredPreview: { parsed: null, raw: "", error: null },
      });
      persistCurrentAiWorkspace(get);
    }
  },
  appendAiMessage: async (role, content) => {
    if (isInternalPlanningPrompt(content)) return;
    let conversationId = get().activeConversationId;
    if (!conversationId) {
      const firstUserTitle = role === "user" ? content.trim().slice(0, 20) : null;
      conversationId = (await get().createConversation(firstUserTitle)).id;
    }
    const optimisticId = `local-${crypto.randomUUID()}`;
    set((state) => ({
      aiWorkspaceEntries: [...state.aiWorkspaceEntries, { id: optimisticId, role, kind: "message" as const, content }].slice(-50),
    }));
    try {
      const message = await api<{ id: string }>("append_ai_message", {
        conversation_id: conversationId,
        role,
        content,
      });
      set((state) => ({
        aiWorkspaceEntries: state.aiWorkspaceEntries.map((entry) =>
          entry.id === optimisticId ? { ...entry, id: message.id } : entry,
        ),
      }));
      persistCurrentAiWorkspace(get);
      await get().loadConversations();
    } catch (error) {
      // Keep the optimistic entry visible locally even if DB write failed
      console.warn("AI message DB persistence failed; keeping local entry.", error);
      persistCurrentAiWorkspace(get);
      throw error;
    }
  },
  saveCurrentPlanSnapshot: async () => {
    const conversationId = get().activeConversationId;
    const parsed = get().aiStructuredPreview.parsed;
    if (!conversationId || !parsed) return;
    await api<AiPlanSnapshot>("save_ai_plan_snapshot", {
      conversation_id: conversationId,
      plan_json: JSON.stringify(parsed),
    });
    persistCurrentAiWorkspace(get);
    await get().loadConversations();
  },
}));
