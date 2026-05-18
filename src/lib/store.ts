import { create } from "zustand";
import { api } from "./api";
import type {
  AiResponse,
  DashboardStats,
  Importance,
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
  selectTask: (id: string | null) => void;
  startFocus: (task: Task, mode?: TimerMode) => Promise<void>;
  startTimer: (input: { topic: string; mode: TimerMode; task_id?: string | null; target_seconds?: number | null }) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  stopTimer: (taskId?: string | null, note?: string) => Promise<void>;
  confirmRecordLink: (taskId?: string | null) => Promise<void>;
  sendAi: (message: string) => Promise<AiResponse>;
  appendAiStream: (delta: string) => void;
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
    await api<void>("delete_task", { id });
    await get().load();
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
  sendAi: async (message) => {
    const nextMessages = [
      ...get().aiMessages,
      { role: "user", content: message } as AiMessage,
      { role: "assistant", content: "" } as AiMessage,
    ].slice(-50);
    set({ aiMessages: nextMessages });
    persistAiMessages(nextMessages);
    const response = await executeFrontendAiIntent(await api<AiResponse>("send_ai_message", { message }));
    await get().load();
    const updatedMessages = get().aiMessages.map((item, index, list) =>
        index === list.length - 1 && item.role === "assistant"
          ? {
              ...item,
              content: summarizeAiResponse(response),
              clarification: response.needs_clarification ? response.clarification : null,
            }
          : item,
      );
    set({ aiMessages: updatedMessages });
    persistAiMessages(updatedMessages);
    return response;
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
    return conversation;
  },
  openConversation: async (id) => {
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
  },
  renameConversation: async (id, title) => {
    const updated = await api<AiConversation>("update_ai_conversation_title", { id, title });
    set((state) => ({ conversations: state.conversations.map((item) => item.id === id ? updated : item) }));
  },
  deleteConversation: async (id) => {
    await api<void>("delete_ai_conversation", { id });
    const conversations = get().conversations.filter((item) => item.id !== id);
    set({ conversations });
    if (get().activeConversationId === id) {
      if (conversations[0]) await get().openConversation(conversations[0].id);
      else set({
        activeConversationId: null,
        aiWorkspaceEntries: [],
        aiWorkspaceInput: "",
        aiStructuredPreview: { parsed: null, raw: "", error: null },
      });
    }
  },
  appendAiMessage: async (role, content) => {
    if (isInternalPlanningPrompt(content)) return;
    let conversationId = get().activeConversationId;
    if (!conversationId) {
      const firstUserTitle = role === "user" ? content.trim().slice(0, 20) : null;
      conversationId = (await get().createConversation(firstUserTitle)).id;
    }
    const message = await api<{ id: string }>("append_ai_message", {
      conversation_id: conversationId,
      role,
      content,
    });
    set((state) => ({
      aiWorkspaceEntries: [...state.aiWorkspaceEntries, { id: message.id, role, kind: "message" as const, content }].slice(-50),
    }));
    await get().loadConversations();
  },
  saveCurrentPlanSnapshot: async () => {
    const conversationId = get().activeConversationId;
    const parsed = get().aiStructuredPreview.parsed;
    if (!conversationId || !parsed) return;
    await api<AiPlanSnapshot>("save_ai_plan_snapshot", {
      conversation_id: conversationId,
      plan_json: JSON.stringify(parsed),
    });
    await get().loadConversations();
  },
}));
