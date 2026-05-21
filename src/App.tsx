import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, Dispatch, DragEvent, ReactNode, SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CirclePlay,
  Clock3,
  Edit2,
  LayoutDashboard,
  ListTodo,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Sprout,
  Square,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import { api } from "./lib/api";
import { TaskUpdatePatch, useAppStore, type AiWorkspaceEntry } from "./lib/store";
import type { AiConversationMessage, Importance, Material, PendingAction, Priority, Reminder, Task, TimerMode, TimerSnapshot, Urgency } from "./lib/types";
import {
  formatMinutes,
  formatSeconds,
  getRecommendedTasks,
  modeLabel,
  parseTags,
  priorityLabel,
  quadrantColors,
  quadrantLabels,
} from "./lib/domain";
import {
  AI_PLANNING_SKILLS,
  buildAdaptiveRescheduleContext,
  buildAdaptiveReschedulePrompt,
  buildInboxCaptureMessage,
  buildMaterialMetadataSummary,
  buildPlanningPrompt,
  buildTaskLoadSummary,
  routePlanningSkill,
  type InboxCaptureItem,
  type InboxCapturePreview,
  type AdaptiveReschedulePreview,
  type PlanningSkillId,
} from "./lib/aiPlanning";
import { safeConversationSummary, safeConversationTitle } from "./lib/aiHistory";

dayjs.extend(isBetween);

const navItems = [
  { id: "workbench", label: "工作台", icon: LayoutDashboard },
  { id: "tasks", label: "任务", icon: ListTodo },
  { id: "timer", label: "计时", icon: Clock3 },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "ai", label: "AI", icon: Bot },
  { id: "settings", label: "设置", icon: Settings },
] as const;

const emptyDraft = {
  title: "",
  description: "",
  priority: "medium" as Priority,
  urgency: "not_urgent" as Urgency,
  importance: "not_important" as Importance,
  deadline: "",
  planned_date: "",
  estimated_duration: "",
  tags: "",
};

type LearningTaskPreview = {
  title?: string;
  description?: string;
  notes?: string;
  importance?: unknown;
  urgency?: unknown;
  estimated_duration?: unknown;
  deadline?: string | null;
  planned_date?: string | null;
  tags?: unknown;
  source_material?: string | null;
  knowledge_points?: unknown;
};

type LearningChapterPreview = {
  title?: string;
  knowledge_points?: unknown;
  difficulty?: string;
  priority?: string;
  estimated_minutes?: number;
  reason?: string;
};

type LearningDailyPlanPreview = {
  date?: string;
  title?: string;
  tasks?: LearningTaskPreview[];
  total_minutes?: number;
  note?: string;
};

type LearningPlanPreview = {
  intent?: string;
  summary?: string;
  goal?: string | {
    title?: string;
    subject?: string;
    exam_type?: string | null;
    deadline?: string | null;
    daily_available_minutes?: number | null;
    rest_days?: unknown;
    current_level?: string | null;
  };
  exam_type?: string | null;
  tasks?: LearningTaskPreview[];
  chapters?: LearningChapterPreview[];
  daily_plan?: LearningDailyPlanPreview[];
  review_rounds?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  review_plan?: Array<Record<string, unknown>>;
  materials?: Array<Record<string, unknown>>;
  adaptive_rules?: Array<Record<string, unknown>>;
  learnkata_links?: Array<Record<string, unknown>>;
  warnings?: unknown[];
  clarification_questions?: unknown[];
  needs_user_confirmation?: boolean;
  plan_scope?: "full_plan" | "first_week_only" | "needs_continue" | string;
};

type PlanningPreview = LearningPlanPreview | AdaptiveReschedulePreview;

type StructuredPreviewState = {
  parsed: PlanningPreview | null;
  raw: string;
  error: string | null;
};

type InboxDraft = InboxCaptureItem & { edited?: boolean };
function defaultTaskDate() {
  return dayjs().format("YYYY-MM-DD");
}

function defaultTaskTime() {
  return dayjs().format("HH:mm");
}

function combineLocalDateTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function splitLocalDateTime(value?: string | null) {
  const parsed = value ? dayjs(value) : null;
  return {
    date: parsed?.isValid() ? parsed.format("YYYY-MM-DD") : defaultTaskDate(),
    time: parsed?.isValid() ? parsed.format("HH:mm") : defaultTaskTime(),
  };
}

function modeTargetSeconds(mode: TimerMode, minutes = 25) {
  if (mode === "positive") return null;
  return Math.max(1, Math.round(minutes)) * 60;
}

function modeIdleSeconds(mode: TimerMode, minutes = 25) {
  return mode === "positive" ? 0 : Math.max(1, Math.round(minutes)) * 60;
}

function modeDescription(mode: TimerMode) {
  if (mode === "pomodoro") return "番茄钟默认 25 分钟倒数，结束后进入记录与关联任务流程。";
  if (mode === "countdown") return "倒计时按自定义时长向下计时，适合限定时间块。";
  return "正计时从 00:00 向上累计，适合自由专注。";
}

type TaskDateFilter = "today" | "tomorrow" | "week" | "all" | "custom";

const needsReviewTags = ["待整理", "needs_review"];

const quadrantMeta: Record<number, { title: string; description: string; urgency: Urgency; importance: Importance }> = {
  1: {
    title: "Q1 重要且紧急",
    description: "马上推进，优先处理有明确时限或高影响的事项。",
    urgency: "urgent",
    importance: "important",
  },
  2: {
    title: "Q2 重要不紧急",
    description: "持续投入，适合安排深度工作和长期建设。",
    urgency: "not_urgent",
    importance: "important",
  },
  3: {
    title: "Q3 紧急不重要",
    description: "快速处理或委托，避免打断核心工作。",
    urgency: "urgent",
    importance: "not_important",
  },
  4: {
    title: "Q4 不重要不紧急",
    description: "低优先级整理区，必要时标记为待整理。",
    urgency: "not_urgent",
    importance: "not_important",
  },
};

function taskDateKey(task: Task) {
  if (task.planned_date) return task.planned_date.slice(0, 10);
  if (task.deadline) return dayjs(task.deadline).format("YYYY-MM-DD");
  return "";
}

function isNeedsReviewTask(task: Task) {
  const tags = parseTags(task);
  return needsReviewTags.some((tag) => tags.includes(tag));
}

function tagsWithNeedsReview(task: Task) {
  const tags = parseTags(task);
  return tags.includes("待整理") ? tags : [...tags.filter((tag) => tag !== "needs_review"), "待整理"];
}

function isTaskVisibleForDateFilter(task: Task, filter: TaskDateFilter, customDate: string) {
  if (task.status === "archived") return false;
  if (filter === "all") return true;
  const today = dayjs().startOf("day");
  const dateKey = taskDateKey(task);
  const date = dateKey ? dayjs(dateKey) : null;
  if (task.status === "done") return false;
  if (filter === "custom") return dateKey === customDate;
  if (filter === "tomorrow") return dateKey === today.add(1, "day").format("YYYY-MM-DD");
  if (filter === "week") return !!date && date.isBetween(today.subtract(1, "millisecond"), today.endOf("week"), null, "[]");
  if (!dateKey) return true;
  if (dateKey === today.format("YYYY-MM-DD")) return true;
  const overdue = date?.isBefore(today, "day");
  return !!overdue && (task.importance === "important" || task.urgency === "urgent");
}

function taskOverdueLabel(task: Task) {
  const key = taskDateKey(task);
  if (!key || task.status === "done") return null;
  return dayjs(key).isBefore(dayjs().startOf("day"), "day") ? "逾期" : null;
}

// ── Lightweight toast system ──
type ToastItem = { id: number; message: string; exiting: boolean };
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toastList: ToastItem[] = [];
let toastIdCounter = 0;

function notifyToastListeners() {
  for (const fn of toastListeners) fn([...toastList]);
}

function showToast(message: string, duration = 3000) {
  const id = ++toastIdCounter;
  toastList = [...toastList, { id, message, exiting: false }];
  notifyToastListeners();
  window.setTimeout(() => {
    toastList = toastList.map((t) => (t.id === id ? { ...t, exiting: true } : t));
    notifyToastListeners();
    window.setTimeout(() => {
      toastList = toastList.filter((t) => t.id !== id);
      notifyToastListeners();
    }, 220);
  }, duration);
}

function parseLearningPlanText(text: string): StructuredPreviewState {
  const candidates = [
    text.trim(),
    text.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim() ?? "",
    (() => {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      return start >= 0 && end > start ? text.slice(start, end + 1) : "";
    })(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as PlanningPreview;
      return { parsed, raw: text, error: null };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    parsed: null,
    raw: text,
    error: text.trim() ? "未能解析为完整 JSON，已保留原文预览。" : null,
  };
}

function isGeneralChatInput(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(hi|hello|hey|你好|您好|嗨|哈喽|在吗|早上好|下午好|晚上好)[\s!！。,.，？?]*$/.test(normalized)) return true;
  if (/^(谢谢|多谢|辛苦了|好的|好|ok|嗯|收到|明白)[\s!！。,.，？?]*$/.test(normalized)) return true;
  if (/^(你是谁|你能做什么|怎么用|介绍一下|帮助|help)[\s!！。,.，？?]*$/.test(normalized)) return true;
  const planningIntent = /计划|安排|任务|提醒|截止|考试|复习|学习|大纲|目录|资料|没完成|调整|顺延|重新安排|番茄|计时|创建|记录/.test(normalized);
  return normalized.length <= 24 && !planningIntent;
}

function fallbackGeneralChatReply(text: string) {
  if (/你好|您好|hi|hello|hey|嗨|哈喽/.test(text.trim().toLowerCase())) {
    return "你好，我可以帮你记录任务、安排计划、调整日程，也可以协助启动和管理专注计时。";
  }
  return "我在。你可以直接告诉我要记录的任务、需要安排的计划，或哪里没完成需要调整。";
}

function setTaskDragData(event: DragEvent<HTMLElement>, taskId: string) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-smartfocus-task-id", taskId);
  event.dataTransfer.setData("task-id", taskId);
  event.dataTransfer.setData("text/plain", taskId);
  console.debug("Quadrant drag started", { taskId, types: Array.from(event.dataTransfer.types) });
}

function getTaskDragData(event: DragEvent<HTMLElement>) {
  return (
    event.dataTransfer.getData("application/x-smartfocus-task-id")
    || event.dataTransfer.getData("task-id")
    || event.dataTransfer.getData("text/plain")
  ).trim();
}

// Pointer Events drag state for quadrant moves (shared across QuadrantColumn/TaskRow)
let _ptrDragTaskId: string | null = null;
let _ptrGhost: HTMLDivElement | null = null;
const _ptrQuadrantRefs = new Map<number, HTMLElement>();
let _ptrHighlightedQuadrant: number | null = null;

function registerQuadrantRef(quadrant: number, el: HTMLElement | null) {
  if (el) _ptrQuadrantRefs.set(quadrant, el);
  else _ptrQuadrantRefs.delete(quadrant);
}

function findQuadrantAtPoint(x: number, y: number): number | null {
  for (const [q, el] of _ptrQuadrantRefs) {
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return q;
  }
  return null;
}

function clearPtrHighlight() {
  if (_ptrHighlightedQuadrant !== null) {
    const el = _ptrQuadrantRefs.get(_ptrHighlightedQuadrant);
    el?.classList.remove("quadrant-drop-highlight");
    _ptrHighlightedQuadrant = null;
  }
}

function removePtrGhost() {
  if (_ptrGhost) { _ptrGhost.remove(); _ptrGhost = null; }
}

function planningChatSummary(parsed: StructuredPreviewState, response: { summary?: string }, skill: PlanningSkillId) {
  const preview = parsed.parsed;
  const questions = stringList(
    !isAdaptiveReschedulePreview(preview) ? preview?.clarification_questions : preview?.clarification_questions,
  );
  if (questions.length > 0) return `还需要确认：${questions.slice(0, 3).join("、")}。`;
  if (isAdaptiveReschedulePreview(preview)) {
    return preview.summary || preview.reason || "我已经给出局部调整建议，右侧计划结果中可以查看受影响任务、调整原因和风险。";
  }
  if (response.summary) return response.summary;
  if (preview?.summary) return preview.summary;
  if (skill === "exam_review_plan" || skill === "goal_intake" || skill === "daily_plan" || skill === "weekly_plan") {
    return "我已经生成了一个复习计划草案，右侧计划结果中可以查看章节覆盖、每日安排和风险提醒。";
  }
  return parsed.error ? "计划结果解析失败，已保留原文在计划结果中查看。" : "我已经整理出一版结构化计划，右侧计划结果已更新。";
}

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

const CONFIRM_KEYWORDS = /^(确认|是|执行|确认删除|继续|好|yes|ok|确定|执行吧|删吧|干吧|走|do|可以|对|没错|就这样)$/;
const CANCEL_KEYWORDS = /^(取消|不要|算了|不了|不执行|取消操作|cancel|no|不|停止|别删|先不做)$/;

function localDateKeyApp(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveDeleteTasksApp(
  mode: "planned_or_deadline" | "created_at" | "all",
  dateOp: "eq" | "gte",
  targetDate: string,
  tasks: Task[],
): Task[] {
  return tasks.filter((task) => {
    if (task.status === "archived" || task.trashed_at) return false;
    if (mode === "all") return true;
    if (mode === "created_at") {
      const created = task.created_at?.slice(0, 10);
      if (!created) return false;
      return dateOp === "eq" ? created === targetDate : created >= targetDate;
    }
    // planned_or_deadline: match if planned_date or deadline is on/after targetDate
    const dates = [task.planned_date, task.deadline].filter(Boolean).map((d) => d!.slice(0, 10));
    if (dates.length === 0) return false;
    return dateOp === "eq"
      ? dates.some((d) => d === targetDate)
      : dates.some((d) => d >= targetDate);
  });
}

function detectDangerousOperation(
  text: string,
  tasks: Task[],
): Omit<PendingAction, "id" | "createdAt" | "expiresAt" | "source"> | null {
  const normalized = text.trim();
  const today = localDateKeyApp();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateKeyApp(d); })();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localDateKeyApp(d); })();
  const dayAfterTomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return localDateKeyApp(d); })();

  // "昨天创建的任务" / "昨天添加的任务" / "昨天录入的任务" — explicit created_at mode
  if (/昨天\s*(创建|添加|录入|新建)/.test(normalized)) {
    const affected = resolveDeleteTasksApp("created_at", "eq", yesterday, tasks);
    return {
      type: "batch_delete",
      params: { raw: normalized, dateMode: "created_at", dateOperator: "eq", targetDate: yesterday, reason: "delete_created_yesterday" },
      summary: `将昨天创建的 ${affected.length} 个任务移动到回收站，可恢复。确认执行吗？`,
      affectedCount: affected.length,
      affectedPreview: affected.slice(0, 5).map((t) => t.title),
      taskIds: affected.map((t) => t.id),
      riskLevel: "high",
    };
  }

  // "把昨天所有任务都删除" / "删除昨天任务" / "昨天的任务" — default = planned_date/deadline
  if (/删除.*昨天|昨天.*删除|把.*昨天.*(?:删除|清|移)|昨天.*(?:任务|计划|待办)/.test(normalized)) {
    const affected = resolveDeleteTasksApp("planned_or_deadline", "eq", yesterday, tasks);
    return {
      type: "batch_delete",
      params: { raw: normalized, dateMode: "planned_or_deadline", dateOperator: "eq", targetDate: yesterday, reason: "delete_yesterday_tasks" },
      summary: `将 ${affected.length} 个昨天任务移动到回收站，可恢复。确认执行吗？`,
      affectedCount: affected.length,
      affectedPreview: affected.slice(0, 5).map((t) => t.title),
      taskIds: affected.map((t) => t.id),
      riskLevel: "high",
    };
  }

  // Delete future tasks: "删除明天以后的任务", "删除从今天往后的计划", "清除从今天往后" etc.
  const futureDeleteMatch = normalized.match(/删除(?:从|了)?\s*(今天|明天|后天|今日|明日)(?:以|之|往|开始|之后|以后|起)(?:的|所有|全部)?\s*(?:任务|计划|待办|事项|东西)/);
  if (futureDeleteMatch || /清空.*(?:未来|以后|之后|往后).*(?:任务|计划|待办)|(?:删除|清除|清空)\s*(?:所有|全部)\s*(?:未完成|未来|之后)/.test(normalized)) {
    const ref = futureDeleteMatch?.[1] ?? "";
    let targetDate = today;
    let dateLabel = "今天";
    if (/明天|明日/.test(ref)) { targetDate = tomorrow; dateLabel = "明天"; }
    else if (/后天/.test(ref)) { targetDate = dayAfterTomorrow; dateLabel = "后天"; }
    else { targetDate = today; dateLabel = "今天"; }
    const affected = resolveDeleteTasksApp("planned_or_deadline", "gte", targetDate, tasks);
    const raw = futureDeleteMatch?.[0] ?? normalized;
    return {
      type: "batch_delete",
      params: { raw, dateMode: "planned_or_deadline", dateOperator: "gte", targetDate, reason: `delete_after_${dateLabel}` },
      summary: `将 ${dateLabel}及之后的 ${affected.length} 个任务移动到回收站，可恢复。确认执行吗？`,
      affectedCount: affected.length,
      affectedPreview: affected.slice(0, 5).map((t) => t.title),
      taskIds: affected.map((t) => t.id),
      riskLevel: "high",
    };
  }

  // "删除所有未完成任务"
  if (/删除\s*(?:所有|全部)\s*未完成/.test(normalized)) {
    const affected = tasks.filter((t) => t.status === "todo" && !t.trashed_at);
    return {
      type: "batch_delete",
      params: { raw: normalized, dateMode: "all", reason: "delete_all_incomplete" },
      summary: `将 ${affected.length} 个未完成任务移动到回收站，可恢复。确认执行吗？`,
      affectedCount: affected.length,
      affectedPreview: affected.slice(0, 5).map((t) => t.title),
      taskIds: affected.map((t) => t.id),
      riskLevel: "high",
    };
  }

  // "删除所有任务" — highest risk
  if (/删除\s*(?:所有|全部)\s*(?:任务|计划|待办)/.test(normalized)) {
    const affected = tasks.filter((t) => t.status !== "archived" && !t.trashed_at);
    return {
      type: "batch_delete",
      params: { raw: normalized, dateMode: "all", reason: "delete_all" },
      summary: `⚠️ 将全部 ${affected.length} 个任务移动到回收站，可恢复。这是高风险操作，确认执行吗？`,
      affectedCount: affected.length,
      affectedPreview: affected.slice(0, 5).map((t) => t.title),
      taskIds: affected.map((t) => t.id),
      riskLevel: "high",
    };
  }

  // Generic delete/clear patterns
  if (/清除|删除.*计划|清空.*任务|批量删除|全部删除|清除所有/.test(normalized)) {
    return {
      type: "batch_delete",
      params: { raw: normalized, dateMode: "all", reason: "batch_delete" },
      summary: `你要求将任务移动到回收站：「${normalized.slice(0, 40)}」。确认执行吗？`,
      affectedCount: 0,
      affectedPreview: [],
      taskIds: [],
      riskLevel: "high",
    };
  }

  // Batch update
  if (/批量.*修改|全部.*改成|所有.*设为|把.*全改/.test(normalized)) {
    return {
      type: "batch_update",
      params: { raw: normalized },
      summary: `你要求批量修改：「${normalized.slice(0, 40)}」。确认执行吗？`,
      affectedCount: 0,
      affectedPreview: [],
      taskIds: [],
      riskLevel: "medium",
    };
  }

  return null;
}

type MiniAiMessage = { role: "user" | "assistant"; content: string; clarification?: string | null };
type MiniAiHistoryItem = { id: string; title: string; messages: MiniAiMessage[]; updatedAt: string };
const miniAiHistoryKey = "smartfocus.workbench_ai_history";

function readMiniAiHistory(): MiniAiHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(miniAiHistoryKey) || "[]") as MiniAiHistoryItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.id && Array.isArray(item.messages)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveMiniAiHistoryItem(messages: MiniAiMessage[]) {
  const visible = messages.filter((message) => message.content.trim());
  if (visible.length === 0) return readMiniAiHistory();
  const firstUser = visible.find((message) => message.role === "user")?.content.trim();
  const item: MiniAiHistoryItem = {
    id: crypto.randomUUID(),
    title: (firstUser || visible[0]?.content || "AI 对话").slice(0, 24),
    messages: visible.slice(-20),
    updatedAt: new Date().toISOString(),
  };
  const next = [item, ...readMiniAiHistory()].slice(0, 8);
  localStorage.setItem(miniAiHistoryKey, JSON.stringify(next));
  return next;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => `${item}`.trim()).filter(Boolean) : [];
}

function toUrgency(value: unknown): Urgency {
  if (value === "urgent" || value === "high" || value === 1 || value === true || value === "1") return "urgent";
  return "not_urgent";
}

function toImportance(value: unknown): Importance {
  if (value === "important" || value === "high" || value === 1 || value === true || value === "1") return "important";
  return "not_important";
}

function previewTaskDraft(task: LearningTaskPreview) {
  return {
    ...emptyDraft,
    title: typeof task.title === "string" ? task.title : "未命名学习任务",
    description: typeof task.description === "string" ? task.description : typeof task.notes === "string" ? task.notes : "",
    urgency: toUrgency(task.urgency),
    importance: toImportance(task.importance),
    estimated_duration:
      typeof task.estimated_duration === "number" && Number.isFinite(task.estimated_duration)
        ? String(task.estimated_duration)
        : "",
    deadline: typeof task.deadline === "string" ? task.deadline : "",
    planned_date: typeof task.planned_date === "string" ? task.planned_date : "",
    tags: stringList(task.tags).join(", "),
  };
}

function isAdaptiveReschedulePreview(preview: PlanningPreview | null): preview is AdaptiveReschedulePreview {
  return preview?.intent === "adaptive_reschedule";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function parseTaskTags(task: Task) {
  return parseTags(task).map((tag) => tag.toLowerCase());
}

function learningPlanSourceTag(preview: LearningPlanPreview | null) {
  const goal = typeof preview?.goal === "object" && preview.goal ? preview.goal : null;
  const title = goal?.title || (typeof preview?.goal === "string" ? preview.goal : "") || preview?.summary || "learning-plan";
  return `ai_learning_plan:${title.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80)}`;
}

function taskDuplicateMatch(existing: Task, draft: ReturnType<typeof previewTaskDraft>, sourceTag: string) {
  if (existing.status === "done" || existing.status === "archived") return false;
  if (normalizeText(existing.title) !== normalizeText(draft.title)) return false;
  if ((existing.planned_date ?? "").slice(0, 10) !== (draft.planned_date ?? "").slice(0, 10)) return false;
  const existingTags = parseTaskTags(existing);
  const draftTags = draft.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  if (existingTags.includes(sourceTag) || draftTags.some((tag) => existingTags.includes(tag))) return true;
  return true;
}

function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    toastListeners.push(setToasts);
    return () => { toastListeners = toastListeners.filter((fn) => fn !== setToasts); };
  }, []);

  useEffect(() => {
    const poll = async () => {
      const due = await import("./lib/api").then(({ api }) => api<Reminder[]>("trigger_due_reminders")).catch(() => []);
      if (due.length > 0) {
        await useAppStore.getState().refreshReminders();
        for (const reminder of due) showToast(`提醒：${reminder.title}`, 4500);
      }
    };
    void poll();
    const intervalId = window.setInterval(poll, 30000);
    return () => window.clearInterval(intervalId);
  }, []);
  return toasts;
}

function ToastContainer() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item${t.exiting ? " toast-exit" : ""}`}>{t.message}</div>
      ))}
    </div>,
    document.body,
  );
}

const aiShortcutEventName = "smartfocus_ai_shortcut";

function requestAiInputFocus() {
  useAppStore.getState().setAiOpen(true);
  window.setTimeout(() => window.dispatchEvent(new Event(aiShortcutEventName)), 0);
}

function App() {
  const store = useAppStore();

  useEffect(() => {
    store.load();
    let disposed = false;
    let unlistenTimer: (() => void) | undefined;
    let unlistenAi: (() => void) | undefined;
    let unlistenAiStream: (() => void) | undefined;
    let unlistenTaskCreated: (() => void) | undefined;
    let aiStreamBuffer = "";
    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        unlistenTimer = await listen("timer_tick", (event) => {
          useAppStore.setState({ timer: event.payload as TimerSnapshot });
        });
        unlistenAi = await listen("shortcut_toggle_ai", () => {
          requestAiInputFocus();
        });
        unlistenAiStream = await listen("ai_stream", (event) => {
          const payload = event.payload as { delta?: unknown; done?: boolean };
          if (payload.done) {
            aiStreamBuffer = "";
            return;
          }
          if (typeof payload.delta !== "string") return;
          const parsed = parseAiStreamDelta(`${aiStreamBuffer}${payload.delta}`);
          aiStreamBuffer = parsed.rest;
          useAppStore.getState().appendAiStream(parsed.delta);
        });
        unlistenTaskCreated = await listen("task_created", () => {
          useAppStore.getState().load();
        });
        if (disposed) {
          unlistenTimer?.();
          unlistenAi?.();
          unlistenAiStream?.();
          unlistenTaskCreated?.();
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlistenTimer?.();
      unlistenAi?.();
      unlistenAiStream?.();
      unlistenTaskCreated?.();
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const current = useAppStore.getState().timer;
      if (!current.active || current.paused) return;
      void api<TimerSnapshot>("get_timer_snapshot")
        .then((timer) => useAppStore.setState({ timer }))
        .catch((error) => console.warn("Timer snapshot polling failed", error));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      requestAiInputFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app-shell min-h-screen min-w-[320px] overflow-x-auto overflow-y-auto p-3 text-[var(--foreground)] md:p-4">
      <div className="app-frame flex min-h-[calc(100vh-1.5rem)] min-w-[320px] gap-3 md:min-h-[calc(100vh-2rem)] md:gap-4">
        <Sidebar />
        <main className="app-main min-w-[320px] flex-1 overflow-visible">
          {store.view === "workbench" && <WorkbenchView />}
          {store.view === "tasks" && <TasksView />}
          {store.view === "timer" && <TimerView />}
          {store.view === "calendar" && <CalendarView />}
          {store.view === "stats" && <StatsView />}
          {store.view === "settings" && <SettingsView />}
          {store.view === "ai" && <AiView />}
        </main>
      </div>
      {store.view !== "workbench" && store.view !== "ai" && (
        <button
          className="btn-glow fixed bottom-6 right-6 z-20 grid h-14 w-14 place-items-center rounded-full text-[var(--primary-foreground)]"
          onClick={() => store.setAiOpen(true)}
          title="AI助手"
        >
          <Bot size={24} />
        </button>
      )}
      {store.aiOpen && <AiPanel />}
      {store.linkPanelOpen && <LinkRecordPanel />}
      <ReminderDock />
      <ToastContainer />
    </div>
  );
}

function Sidebar() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  return (
    <aside className="glass-card flex w-16 min-w-16 max-w-[220px] shrink-0 flex-col items-center gap-3 py-4 [transition:var(--transition-smooth)] md:hover:w-[180px] md:hover:min-w-[180px]">
      <div className="sf-logo btn-glow mb-2 grid h-10 w-10 place-items-center rounded-xl bg-[var(--gradient-violet)] text-sm font-bold text-[var(--primary-foreground)] shadow-[var(--shadow-glow-violet)] [transition:var(--transition-smooth)]">
        SF
      </div>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            title={item.label}
            className={`sidebar-nav-button group flex h-11 w-[calc(100%-16px)] items-center justify-center gap-3 rounded-xl text-[var(--muted-foreground)] hover:bg-white/10 hover:text-[var(--foreground)] ${
              active ? "bg-[var(--sidebar-accent)] text-[var(--neon-violet)] shadow-[var(--shadow-glow-violet)]" : ""
            }`}
          >
            <Icon size={20} />
            <span className="hidden whitespace-nowrap text-sm font-medium md:group-hover:inline">{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
}

function WorkbenchView() {
  const { tasks, timer, timerTopic, timerTaskId, setTimerContext, records, selectTask, startFocus, startTimer, pauseTimer, resetTimer, stopTimer, setView } = useAppStore();
  const [timerMode, setTimerMode] = useState<TimerMode>("positive");
  const [centerPanel, setCenterPanel] = useState<"timer" | "calendar">("timer");
  const [isTopicPopoverOpen, setIsTopicPopoverOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ left: number; top?: number; bottom?: number; openUp: boolean }>({ left: 0, openUp: false });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setIsTopicPopoverOpen(false);
      }
    }
    if (isTopicPopoverOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTopicPopoverOpen]);

  useEffect(() => {
    if (!isTopicPopoverOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferOpenUp = spaceBelow < 280 && spaceAbove > 280;
    const left = Math.max(8, rect.left);
    if (preferOpenUp) {
      // position using bottom relative to viewport
      const bottom = window.innerHeight - rect.top + 8;
      setPopoverCoords({ left, bottom, openUp: true });
    } else {
      const top = rect.bottom + 8;
      setPopoverCoords({ left, top, openUp: false });
    }
  }, [isTopicPopoverOpen, timerTopic]);

  
  const [selectedWorkbenchDate, setSelectedWorkbenchDate] = useState(dayjs().format("YYYY-MM-DD"));
  const today = dayjs().format("YYYY-MM-DD");
  const activeTasks = tasks.filter((task) => task.status !== "archived");
  const todayTasks = activeTasks
    .filter((task) => task.status !== "done" && (!task.planned_date || task.planned_date === today))
    .sort((a, b) => a.quadrant - b.quadrant || b.sort_order - a.sort_order)
    .slice(0, 4);
  const todayRecords = records.filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === today);
  const liveSeconds = timer.active ? timer.elapsed_seconds : 0;
  const focusSeconds = todayRecords.reduce((sum, record) => sum + Math.round(record.duration * 60), 0) + liveSeconds;
  const totalToday = tasks.filter((task) => task.status !== "archived" && (!task.planned_date || task.planned_date === today)).length;
  const doneToday = tasks.filter((task) => task.status === "done" && (!task.planned_date || task.planned_date === today)).length;
  const completionRate = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const gardenProgress = Math.min(100, Math.round((focusSeconds / (4 * 60 * 60)) * 100));
  
  const workbenchRecommended = getRecommendedTasks(tasks, records, timerTopic, timerTaskId);

  // Sync local timerMode with actual timer.mode when timer is active
  useEffect(() => {
    if (timer.active && timer.mode && timer.mode !== timerMode) {
      setTimerMode(timer.mode);
    }
  }, [timer.active, timer.mode]);
  
  const displaySeconds =
    timer.mode === "positive" || !timer.remaining_seconds ? timer.elapsed_seconds : timer.remaining_seconds;
  const selectedTimerMinutes = timerMode === "pomodoro" ? 25 : 30;
  const workbenchTimerActiveMode = timer.active && timer.mode ? timer.mode : timerMode;
  const workbenchTimerTarget = timer.target_seconds ?? modeIdleSeconds(timerMode, selectedTimerMinutes);
  const workbenchTimerSeconds = timer.active ? displaySeconds : modeIdleSeconds(timerMode, selectedTimerMinutes);
  const workbenchTimerProgress = timer.active
    ? timer.mode === "positive"
      ? Math.max(4, (timer.elapsed_seconds / Math.max(timer.target_seconds ?? 3600, 1)) * 100)
      : Math.max(4, ((Math.max(timer.target_seconds ?? workbenchTimerTarget, 1) - (timer.remaining_seconds ?? 0)) / Math.max(timer.target_seconds ?? workbenchTimerTarget, 1)) * 100)
    : timerMode === "positive"
      ? 8
      : 100;
  const workbenchDate = dayjs(selectedWorkbenchDate);
  const workbenchMonthDays = useMemo(() => {
    const selectedMonth = dayjs(selectedWorkbenchDate).startOf("month");
    const gridStart = selectedMonth.startOf("week");
    return Array.from({ length: 42 }, (_, index) => gridStart.add(index, "day"));
  }, [selectedWorkbenchDate]);
  const selectedWorkbenchTasks = activeTasks.filter((task) => task.planned_date === selectedWorkbenchDate);
  const taskDotColor = (task: Task) => `var(--prio-p${task.quadrant})`;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const checkWorkbenchOverlap = () => {
      const nodes = [...document.querySelectorAll("[data-ui-region]")];
      const rects = nodes.map((node) => ({
        name: node.getAttribute("data-ui-region"),
        rect: node.getBoundingClientRect(),
      }));

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const overlap =
            a.rect.left < b.rect.right &&
            a.rect.right > b.rect.left &&
            a.rect.top < b.rect.bottom &&
            a.rect.bottom > b.rect.top;

          if (overlap) {
            console.warn("WORKBENCH_OVERLAP:", a.name, b.name, a.rect, b.rect);
          }
        }
      }
    };

    (window as typeof window & { checkWorkbenchOverlap?: () => void }).checkWorkbenchOverlap = checkWorkbenchOverlap;
    window.setTimeout(checkWorkbenchOverlap, 0);
  }, [centerPanel, tasks.length, timer.active, timer.elapsed_seconds]);

  return (
    <section className="workbench-grid animate-rise min-h-0 gap-4 overflow-visible">
      <div className="workbench-main workbench-left-grid grid min-h-0 gap-4 overflow-visible">
        <section data-ui-region="ai-command" className="glass-card hero-card-light lift-card flex min-h-[320px] flex-col overflow-hidden p-4">
          <div className="mb-2 flex shrink-0 items-start justify-between gap-4">
            <div>
              <p className="section-label flex items-center gap-2">
                <Sparkles size={15} /> AI Agent Command Stream
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-normal text-[var(--foreground)] md:text-3xl">
                今天想怎么<span className="neon-text">编排?</span>
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className="btn-glow rounded-xl px-3 py-1.5 text-xs font-semibold" onClick={() => setView("ai")}>
                打开 AI 工作区
              </button>
              <button type="button" className="glass-inset px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)]" onClick={() => setView("tasks")}>
                手动创建
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 flex flex-col pb-1">
            <AiPanel embedded />
          </div>
        </section>

        <div className="workbench-lower grid min-h-0 gap-4 overflow-visible">
          <section data-ui-region="today-stack" className="glass-card subtle-card-light lift-card flex min-h-[340px] flex-col overflow-hidden p-5">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <div>
                <p className="section-label flex items-center gap-2">
                  <ListTodo size={15} /> Today Stack
                </p>
                <h2 className="mt-3 text-2xl font-bold">今日待办</h2>
              </div>
              <button type="button" className="text-sm text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:text-[var(--neon-blue)]" onClick={() => setView("tasks")}>
                查看任务 →
              </button>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-auto px-1 pb-1">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="today-task-card group w-full cursor-pointer p-3"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                  onClick={() => {
                    selectTask(task.id);
                    setView('tasks');
                  }}
                >
                  {/* 左侧：开始按钮 */}
                  <button
                    className="today-task-play grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--background)]/50 border border-[var(--border)] text-[var(--muted-foreground)] transition-all duration-200 hover:bg-[var(--neon-violet)]/20 hover:text-[var(--neon-violet)] hover:border-[var(--neon-violet)]/50 focus:outline-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (timer.active) {
                        showToast("当前正在计时，请先结束或重置当前计时后再开始新的任务。");
                        return;
                      }
                      startFocus(task);
                    }}
                    title="开始执行"
                  >
                    <Play size={18} className="translate-x-[1px]" />
                  </button>

                  {/* 右侧：文字内容区 */}
                  <div className="today-task-content min-w-0 flex-1 flex flex-col gap-1 overflow-hidden">
                    <span className="today-task-title truncate text-[15px] font-semibold leading-tight group-hover:text-[var(--neon-blue)] transition-colors duration-200">
                      {task.title}
                    </span>
                    <div className="today-task-meta flex items-center gap-2 text-xs text-[var(--muted-foreground)] flex-nowrap whitespace-nowrap overflow-x-auto thin-scrollbar">
                      <PriorityDot quadrant={task.quadrant} />
                      <span>Q{task.quadrant} {quadrantLabels[task.quadrant]}</span>
                      <span>·</span>
                      <span>{task.estimated_duration ? formatMinutes(task.estimated_duration) : '未估时'}</span>
                    </div>
                  </div>
                </div>
              ))}
              {todayTasks.length === 0 && (
                <div className="glass-inset border-dashed p-4 text-sm text-[var(--muted-foreground)]">
                  还没有今日待办，可以直接在上方让 AI 创建或安排任务。
                </div>
              )}
            </div>
          </section>

          <section data-ui-region="timeline-timer" className="glass-card panel-card-light lift-card flex min-h-[430px] flex-col overflow-hidden p-5">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <div>
                <p className="section-label flex items-center gap-2">
                  <Clock3 size={15} /> Timeline + Timer
                </p>
                <h2 className="mt-3 text-2xl font-bold">日历计时融合视图</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="glass-inset px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:text-white rounded-lg [transition:var(--transition-smooth)] hover:bg-[var(--glass-card-bg-hover)]"
                  title={centerPanel === "timer" ? "打开完整计时页" : "打开完整日历页"}
                  onClick={() => setView(centerPanel)}
                >
                  完整页
                </button>
                <div className="glass-inset flex shrink-0 p-1 text-sm">
                  <button className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${centerPanel === "timer" ? "btn-glow font-medium" : "text-[var(--muted-foreground)] hover:text-[var(--neon-blue)]"}`} onClick={() => setCenterPanel("timer")}>
                    计时
                  </button>
                  <button className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${centerPanel === "calendar" ? "btn-glow font-medium" : "text-[var(--muted-foreground)] hover:text-[var(--neon-blue)]"}`} onClick={() => setCenterPanel("calendar")}>
                    日历
                  </button>
                </div>
              </div>
            </div>
            {centerPanel === "timer" ? (
            <div className="timer-card-body thin-scrollbar grid min-h-0 flex-1 items-center gap-6 overflow-auto pr-1 md:grid-cols-[minmax(220px,0.48fr)_minmax(260px,0.52fr)]">
              <div className="flex min-h-0 items-center justify-center md:justify-end">
                <TimerOrb compact seconds={workbenchTimerSeconds} progress={workbenchTimerProgress} mode={workbenchTimerActiveMode} />
              </div>
              <div className="min-w-0 space-y-4 self-center md:max-w-[390px]">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">当前主题</p>
                  <button
                    ref={el => { triggerRef.current = el; }}
                    className="mt-1 flex items-center gap-2 group hover:opacity-80 transition-opacity text-left max-w-full"
                    onClick={() => !timer.active && setIsTopicPopoverOpen(v => !v)}
                    disabled={timer.active}
                    aria-label="选择关联任务或输入主题"
                  >
                    <h3 className="text-lg font-bold leading-snug truncate group-hover:underline decoration-[var(--muted-foreground)] underline-offset-4">
                      {timer.active ? (timer.topic || "自由专注") : (timerTaskId ? tasks.find(t => t.id === timerTaskId)?.title || "任务已失效" : timerTopic)}
                    </h3>
                    {!timer.active && <Edit2 size={12} className="text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </button>

                  {isTopicPopoverOpen && !timer.active && triggerRef.current && createPortal(
                    <div
                      ref={popoverRef}
                      style={{
                        position: 'absolute',
                        left: popoverCoords.left,
                        top: popoverCoords.openUp ? undefined : popoverCoords.top,
                        bottom: popoverCoords.openUp ? popoverCoords.bottom : undefined,
                        width: 320,
                        maxWidth: 'calc(100vw - 32px)',
                      }}
                      className="z-[9999] bg-[var(--background)]/95 backdrop-blur-3xl rounded-xl p-3 shadow-[0_12px_48px_rgba(0,0,0,0.5)] border border-white/6 max-h-[320px] overflow-y-auto thin-scrollbar flex flex-col"
                    >
                      <div className="mb-3">
                        <input
                          className="field w-full text-sm !bg-black/20 focus:!bg-black/40"
                          placeholder="输入自由专注主题"
                          value={timerTopic}
                          onChange={(e) => setTimerContext(e.target.value, timerTaskId)}
                        />
                      </div>

                      <div className="space-y-1">
                        <button
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!timerTaskId ? "bg-white/10 text-[var(--neon-blue)] font-medium" : "hover:bg-white/10"}`}
                          onClick={() => { setTimerContext(timerTopic, null); setIsTopicPopoverOpen(false); }}
                        >
                          仅记录时间 (无关联任务)
                        </button>

                        {workbenchRecommended.length > 0 && <div className="text-xs font-semibold text-[var(--muted-foreground)] px-2 pt-3 pb-1.5">推荐关联任务：</div>}
                        {workbenchRecommended.map(t => (
                          <button
                            key={t.id}
                            className={`w-full flex flex-col items-start px-3 py-2 rounded-lg transition-colors ${timerTaskId === t.id ? "bg-[var(--neon-violet)]/20 text-[var(--neon-violet)]" : "hover:bg-white/10"}`}
                            onClick={() => { setTimerContext(t.title, t.id); setIsTopicPopoverOpen(false); }}
                          >
                            <span className="text-sm truncate w-full text-left font-medium">{t.title}</span>
                            {t.recommendReason && <span className="text-[10px] text-[var(--muted-foreground)] opacity-80 mt-0.5">{t.recommendReason}</span>}
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                <div className="glass-inset p-3 text-xs leading-6 text-[var(--muted-foreground)]">
                  {modeDescription(timerMode)}
                </div>
                <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                  {!timer.active ? (
                    <button
                      className="btn-glow flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                      onClick={() => {
                        if (timer.active) {
                          showToast("当前正在计时，请先结束或重置后再开始新的计时。");
                          return;
                        }
                        startTimer({
                          topic: timerTopic,
                          mode: timerMode,
                          task_id: timerTaskId,
                          target_seconds: modeTargetSeconds(timerMode, selectedTimerMinutes),
                        });
                      }}
                    >
                      <Play size={17} /> 开始
                    </button>
                  ) : (
                    <>
                      <button className="btn-glow flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" onClick={pauseTimer}>
                        {timer.paused ? <Play size={17} /> : <Pause size={17} />} {timer.paused ? "继续" : "暂停"}
                      </button>
                      <button className="glass-inset flex items-center gap-2 px-4 py-2 text-sm [transition:var(--transition-smooth)] hover:text-[var(--neon-blue)]" onClick={() => stopTimer(timer.task_id ?? null)}>
                        <Square size={17} /> 结束
                      </button>
                    </>
                  )}
                  <button className="glass-inset flex items-center gap-2 px-4 py-2 text-sm [transition:var(--transition-smooth)] hover:text-[var(--neon-blue)]" onClick={resetTimer}>
                    <RotateCcw size={17} /> 重置
                  </button>
                </div>
                <div className="glass-inset inline-flex p-1 text-sm">
                  {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((m) => (
                    <button
                      key={m}
                      className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${timerMode === m ? "btn-glow" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                      onClick={() => {
                        if (timer.active) {
                          showToast("当前正在计时，请先暂停、结束或重置后再切换模式。");
                          return;
                        }
                        setTimerMode(m);
                        showToast(`已切换为${modeLabel(m)}`);
                      }}
                    >
                      {modeLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
                <div className="thin-scrollbar min-h-0 overflow-auto p-1">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <button type="button" className="glass-inset interactive-surface grid h-8 w-8 place-items-center text-sm" onClick={() => setSelectedWorkbenchDate(workbenchDate.subtract(1, "month").format("YYYY-MM-DD"))} aria-label="上个月">
                      ‹
                    </button>
                    <div>
                      <p className="text-xs text-[var(--muted-foreground)]">月历总览</p>
                      <h3 className="text-sm font-semibold">{workbenchDate.format("YYYY 年 M 月")}</h3>
                    </div>
                    <button type="button" className="glass-inset interactive-surface grid h-8 w-8 place-items-center text-sm" onClick={() => setSelectedWorkbenchDate(workbenchDate.add(1, "month").format("YYYY-MM-DD"))} aria-label="下个月">
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-[var(--muted-foreground)]">
                    {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                      <span key={day}>周{day}</span>
                    ))}
                  </div>
                  <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                  {workbenchMonthDays.map((date) => {
                    const key = date.format("YYYY-MM-DD");
                    const dayItems = activeTasks.filter((task) => task.planned_date === key);
                    const isToday = key === today;
                    const isSelected = selectedWorkbenchDate === key;
                    const isOutsideMonth = date.month() !== workbenchDate.month();
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`glass-inset interactive-surface min-h-[42px] min-w-0 p-1.5 text-left hover:border-[var(--ring)] ${isSelected ? "ring-2 ring-[var(--ring)]" : ""} ${isOutsideMonth ? "opacity-45" : ""}`}
                        onClick={() => setSelectedWorkbenchDate(key)}
                      >
                        <span className={`grid h-5 w-5 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-[var(--neon-violet)] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-violet)]" : ""}`}>
                          {date.date()}
                        </span>
                        <span className="mt-1 flex min-h-2 flex-wrap gap-0.5">
                          {dayItems.slice(0, 3).map((task) => (
                            <span key={task.id} className="h-1.5 w-1.5 rounded-full" style={{ background: taskDotColor(task), boxShadow: `0 0 8px ${taskDotColor(task)}` }} />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                  </div>
                </div>
                <aside className="glass-inset mini-calendar-scroll min-h-0 overflow-auto p-3">
                  <p className="text-xs text-[var(--muted-foreground)]">{workbenchDate.format("YYYY-MM-DD")}</p>
                  <h3 className="mt-1 font-semibold">当日任务</h3>
                  <div className="mt-3 space-y-2">
                    {selectedWorkbenchTasks.map((task) => (
                      <button key={task.id} type="button" className="interactive-surface flex w-full items-center gap-2 rounded-lg border border-white/10 p-2 text-left text-sm" onClick={() => {
                        selectTask(task.id);
                        setView("tasks");
                      }}>
                        <PriorityDot quadrant={task.quadrant} />
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      </button>
                    ))}
                    {selectedWorkbenchTasks.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">这天还没有安排。</p>}
                  </div>
                </aside>
              </div>
            )}
          </section>
        </div>
      </div>

      <aside className="workbench-right-rail flex min-h-0 flex-col gap-4 overflow-visible">
        <section data-ui-region="focus-garden" className="glass-card panel-card-light lift-card flex min-h-[180px] shrink-0 flex-col items-center overflow-hidden p-4 text-center">
          <p className="section-label flex w-full items-center gap-2 text-left">
            <Sprout size={15} /> Focus Garden
          </p>
          <svg className="garden-svg mx-auto mt-5 h-32 w-32 text-[var(--neon-amber)]" viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="58" fill="oklch(1 0 0 / 0.035)" stroke="oklch(1 0 0 / 0.08)" />
            <path d="M60 82V61M60 61c-16 0-22-13-22-25 16 0 22 9 22 25Zm0 0c16 0 22-13 22-25-16 0-22 9-22 25Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M43 84h34" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </svg>
          <div className="neon-text mt-4 text-4xl font-bold">{gardenProgress}%</div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">播下一颗专注种子，开始第一段计时。</p>
        </section>
        <section data-ui-region="quick-stats" className="glass-card subtle-card-light lift-card quick-stats-panel shrink-0 overflow-visible p-4">
          <p className="section-label flex items-center gap-2">
            <BarChart3 size={15} /> Quick Stats
          </p>
          <div className="quick-stats-grid mt-4">
            <MiniStat label="今日专注" value={formatSeconds(focusSeconds)} tone="blue" />
            <MiniStat label="完成率" value={`${completionRate}%`} tone="violet" />
            <MiniStat label="未完成" value={`${activeTasks.filter((task) => task.status !== "done").length} 项`} tone="pink" />
            <MiniStat label="今日计时" value={`${todayRecords.length + (timer.active ? 1 : 0)} 次`} tone="amber" />
          </div>
        </section>
        <section data-ui-region="achievements" className="glass-card subtle-card-light lift-card flex min-h-[180px] flex-1 flex-col overflow-hidden p-4">
          <p className="section-label flex items-center gap-2">
            <Trophy size={15} /> Achievements
          </p>
          <div className="achievement-scroll mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 pr-2">
            <Achievement label="深度专注者" current={Math.min(4, Math.floor(focusSeconds / 1800))} total={4} />
            <Achievement label="晨型选手" current={Math.min(5, doneToday)} total={5} />
            <Achievement label="连续 7 天" current={Math.min(7, todayRecords.length)} total={7} />
            <Achievement label="番茄达人" current={Math.min(6, todayRecords.filter((record) => record.mode === "pomodoro").length)} total={6} />
            <Achievement label="今日终结者" current={Math.min(5, doneToday)} total={5} />
            <Achievement label="计划守护者" current={Math.min(6, todayTasks.length + doneToday)} total={6} />
          </div>
        </section>
      </aside>
    </section>
  );
}

function AiPanel({
  embedded = false,
  draftPrompt,
  onResponse,
}: {
  embedded?: boolean;
  draftPrompt?: string;
  onResponse?: (response: unknown) => void;
}) {
  const { aiMessages, setAiOpen, sendAi, setAiMessages } = useAppStore();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [miniHistory, setMiniHistory] = useState<MiniAiHistoryItem[]>(() => readMiniAiHistory());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [aiMessages]);

  useEffect(() => {
    if (draftPrompt) setInput(draftPrompt);
  }, [draftPrompt]);

  function startSpeech() {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setInput(text);
      if (text) {
        void sendAi(text).then(onResponse);
      }
    };
    recognition.start();
  }

  const panel = (
    <aside
      className={`${embedded ? "ai-panel-embedded flex min-h-0 flex-1 flex-col" : "glass-card ai-panel-floating flex h-[min(620px,calc(100vh-48px))] w-[min(420px,calc(100vw-24px))] flex-col p-5"}`}
      onClick={(event) => event.stopPropagation()}
    >
      {!embedded && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">AI助手</h2>
          <button className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:text-[var(--neon-pink)]" onClick={() => setAiOpen(false)}>
            x
          </button>
        </div>
      )}
      {embedded && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <div className="relative flex gap-2">
            <button
              className="glass-inset px-2.5 py-1 text-xs"
              type="button"
              onClick={() => {
                setMiniHistory(saveMiniAiHistoryItem(aiMessages));
                setAiMessages([]);
                setHistoryOpen(false);
              }}
            >
              新对话
            </button>
            <button
              className="glass-inset px-2.5 py-1 text-xs"
              type="button"
              onClick={() => {
                setMiniHistory(readMiniAiHistory());
                setHistoryOpen((value) => !value);
              }}
            >
              历史
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-8 z-20 w-64 rounded-xl border border-white/10 bg-[var(--background)]/95 p-2 shadow-[0_16px_42px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <button
                  className="glass-inset mb-2 w-full px-3 py-2 text-left text-xs"
                  type="button"
                  onClick={() => {
                    setMiniHistory(saveMiniAiHistoryItem(aiMessages));
                    setAiMessages([]);
                    setHistoryOpen(false);
                  }}
                >
                  清空当前显示
                </button>
                {miniHistory.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-[var(--muted-foreground)]">暂无最近历史</p>
                ) : miniHistory.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10"
                    type="button"
                    onClick={() => {
                      setMiniHistory(saveMiniAiHistoryItem(aiMessages));
                      setAiMessages(item.messages);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="text-[var(--muted-foreground)]">{dayjs(item.updatedAt).format("MM-DD HH:mm")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
        {aiMessages.length === 0 ? (
          <div className="glass-inset p-2.5 text-xs text-[var(--muted-foreground)]">
            告诉我你想记录、规划或调整什么。
          </div>
        ) : (
          aiMessages.map((message, index) => (
            <div key={index} className={`chat-bubble w-fit max-w-[78%] rounded-xl text-sm leading-6 break-words [transition:var(--transition-smooth)] ${message.role === "user" ? "chat-bubble-user btn-glow ml-auto text-[var(--primary-foreground)]" : "chat-bubble-ai glass-inset mr-auto"}`}>
              {message.content || (message.role === "assistant" ? (
                <span className="inline-flex items-center gap-2">
                  正在思考
                  <span className="typing-dots" aria-label="正在生成"><span /><span /><span /></span>
                </span>
              ) : "")}
            </div>
          ))
        )}
      </div>
      <form
        className="mt-auto mb-0 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          void sendAi(input).then(onResponse);
          setInput("");
        }}
      >
        <button className={`grid h-12 w-12 place-items-center rounded-full border border-white/10 text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)] ${listening ? "text-[var(--neon-pink)] shadow-[var(--shadow-glow-violet)]" : ""}`} type="button" onClick={startSpeech} title="语音输入">
          <Mic size={20} />
        </button>
        <input className="glass-inset min-w-0 px-4 py-3 text-sm outline-none [transition:var(--transition-smooth)] focus:border-[var(--ring)]" value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入或语音描述你想做的事..." />
        <button className="btn-glow grid h-12 w-14 place-items-center rounded-xl text-sm font-semibold" type="submit" title="发送">
          <Send size={18} />
        </button>
      </form>
    </aside>
  );

  if (embedded) return panel;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-end bg-slate-950/40 p-4 pb-8 backdrop-blur-sm" onClick={() => setAiOpen(false)}>
      {panel}
    </div>
  );
}

function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-inset p-3">
      <h4 className="font-semibold">{title}</h4>
      <div className="mt-2 text-sm leading-6">{children}</div>
    </section>
  );
}

function RecordListBlock({ title, items }: { title: string; items?: Array<Record<string, unknown>> }) {
  return (
    <PreviewBlock title={title}>
      {Array.isArray(items) && items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <pre key={`${title}-${index}`} className="whitespace-pre-wrap break-words rounded-xl border border-white/10 p-3 text-xs leading-6">
              {JSON.stringify(item, null, 2)}
            </pre>
          ))}
        </div>
      ) : (
        <p>暂无结构化结果</p>
      )}
    </PreviewBlock>
  );
}

function formatMaterialSize(size?: number | null) {
  if (size == null) return "文件夹 / 未知大小";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function AiView() {
  const {
    createTask, createReminder, createMaterial, reminders, materials, materialsLoading, materialsError, loadMaterials,
    addMaterialFiles, addMaterialFolder, updateMaterial, removeMaterialRecord, tasks: allTasks, records,
    aiWorkspaceInput: input, setAiWorkspaceInput: setInput,
    aiWorkspaceEntries: entries, setAiWorkspaceEntries: setEntries,
    aiPreferredSkill, setAiPreferredSkill,
    aiStructuredPreview, setAiStructuredPreview,
    aiPlanCanvasOpen, setAiPlanCanvasOpen,
    conversations, activeConversationId, loadConversations, createConversation, openConversation,
    renameConversation, deleteConversation, appendAiMessage, saveCurrentPlanSnapshot,
    pendingAction, setPendingAction, moveTasksToTrash, loadTrashedTasks, load: storeLoad, orchestrateAiInput,
  } = useAppStore();
  const preferredSkill = aiPreferredSkill as PlanningSkillId | null;
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialStatusFilter, setMaterialStatusFilter] = useState<"all" | Material["status"]>("all");
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState({ subject: "", tags: "", note: "" });
  const [lastRoute, setLastRoute] = useState(routePlanningSkill(""));
  const [activeAiToolPanel, setActiveAiToolPanelState] = useState<"materials" | "plan" | "reminders" | "more" | "quick" | null>(aiPlanCanvasOpen ? "plan" : null);
  const setActiveAiToolPanel = (value: "materials" | "plan" | "reminders" | "more" | "quick" | null | ((current: "materials" | "plan" | "reminders" | "more" | "quick" | null) => "materials" | "plan" | "reminders" | "more" | "quick" | null)) => {
    setActiveAiToolPanelState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      setAiPlanCanvasOpen(next === "plan");
      return next;
    });
  };
  const toggleAiToolPanel = (panel: "materials" | "plan" | "reminders" | "more" | "quick") => {
    setActiveAiToolPanel((current) => (current === panel ? null : panel));
  };
  const [loading, setLoading] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("");
  const sendingRef = useRef(false);
  const currentRequestRef = useRef<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDetails, setHistoryDetails] = useState<Record<string, {
    messages: AiConversationMessage[];
    title: string;
    summary: string;
    messageCount: number;
    hasPlan: boolean;
  }>>({});
  const preview = aiStructuredPreview as StructuredPreviewState;
  const setPreview = setAiStructuredPreview as (value: StructuredPreviewState) => void;
  const [selectedTaskIndexes, setSelectedTaskIndexes] = useState<number[]>([]);
  const [applyResults, setApplyResults] = useState<Array<{ title: string; status: "success" | "skipped_duplicate" | "failed"; message: string }>>([]);
  const [selectedRescheduleIndexes, setSelectedRescheduleIndexes] = useState<number[]>([]);
  const [rescheduleApplyResults, setRescheduleApplyResults] = useState<Array<{ title: string; status: "applied" | "skipped" | "failed"; message: string }>>([]);
  const [studyDrawerOpen, setStudyDrawerOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [studyDraft, setStudyDraft] = useState({
    title: "",
    subject: "",
    examType: "期末",
    deadline: "",
    dailyMinutes: "",
    restDays: "",
    currentLevel: "",
    outline: "",
    note: "",
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const tasks = !isAdaptiveReschedulePreview(preview.parsed) && Array.isArray(preview.parsed?.daily_plan)
    ? preview.parsed.daily_plan.flatMap((day) => Array.isArray(day.tasks) ? day.tasks : [])
    : !isAdaptiveReschedulePreview(preview.parsed) && Array.isArray(preview.parsed?.tasks)
      ? preview.parsed.tasks
      : [];
  const selectedTasks = tasks.filter((_, index) => selectedTaskIndexes.includes(index));
  const selectedRescheduleSuggestions = isAdaptiveReschedulePreview(preview.parsed)
    ? preview.parsed.suggestions.filter((_, index) => selectedRescheduleIndexes.includes(index))
    : [];
  const pendingReminderCount = reminders.filter((item) => item.status === "pending").length;
  const visibleMaterials = materials.filter((material) => {
    const haystack = `${material.name} ${material.subject ?? ""} ${material.tags} ${material.note ?? ""}`.toLowerCase();
    return haystack.includes(materialSearch.toLowerCase()) && (materialStatusFilter === "all" || material.status === materialStatusFilter);
  });

  useEffect(() => { void loadMaterials(); }, [loadMaterials]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries]);

  useEffect(() => {
    if (!activeAiToolPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveAiToolPanel(null); };
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".ai-tool-panel") || el.closest(".ai-plan-drawer") || el.closest("[data-ai-toolbar]")) return;
      setActiveAiToolPanel(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("click", onClick); };
  }, [activeAiToolPanel]);

  useEffect(() => {
    if (!historyDialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDialogOpen]);

  useEffect(() => {
    if (!trashDialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTrashDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trashDialogOpen]);

  useEffect(() => {
    if (!historyDialogOpen) return;
    let cancelled = false;
    void Promise.all(conversations.map(async (conversation) => {
      const [detail, snapshot] = await Promise.all([
        api<{ messages: AiConversationMessage[] }>("get_ai_conversation", { id: conversation.id }).catch(() => ({ messages: [] })),
        api<{ plan_json: string } | null>("get_ai_plan_snapshot", { conversation_id: conversation.id }).catch(() => null),
      ]);
      let goalTitle: string | null = null;
      if (snapshot?.plan_json) {
        try {
          goalTitle = (JSON.parse(snapshot.plan_json) as { goal?: { title?: string | null } }).goal?.title ?? null;
        } catch {
          goalTitle = null;
        }
      }
      return [conversation.id, {
        messages: detail.messages,
        title: safeConversationTitle(conversation.title, detail.messages, goalTitle),
        summary: safeConversationSummary(detail.messages),
        messageCount: detail.messages.length,
        hasPlan: Boolean(snapshot?.plan_json),
      }] as const;
    })).then((items) => {
      if (!cancelled) setHistoryDetails(Object.fromEntries(items));
    });
    return () => { cancelled = true; };
  }, [conversations, historyDialogOpen]);

  const addEntry = (entry: AiWorkspaceEntry) => setEntries((current) => [...current, entry]);
  const appendVisibleAiMessage = async (role: "user" | "assistant", content: string) => {
    try {
      await appendAiMessage(role, content);
      return true;
    } catch (error) {
      // appendAiMessage already created an optimistic entry in the store;
      // only add a local fallback if the optimistic entry was NOT created
      // (which happens when the function throws before the set() call).
      console.warn("AI workspace history append failed; checking if optimistic entry exists.", error);
      const current = useAppStore.getState().aiWorkspaceEntries;
      const hasOptimistic = current.some((entry) => entry.kind === "message" && entry.role === role && entry.content === content);
      if (!hasOptimistic) {
        addEntry({ id: `local-${crypto.randomUUID()}`, role, kind: "message", content });
      }
      return false;
    }
  };
  const updateInboxEntry = (id: string, updater: (entry: Extract<AiWorkspaceEntry, { kind: "inbox" }>) => Extract<AiWorkspaceEntry, { kind: "inbox" }>) =>
    setEntries((current) => current.map((entry) => entry.id === id && entry.kind === "inbox" ? updater(entry) : entry));

  const updatePreviewFromResponse = (response: unknown) => {
    const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
    const candidate = typeof record.reply === "string" && record.reply.trim() ? record.reply : JSON.stringify(record, null, 2);
    const parsed = parseLearningPlanText(candidate);
    if (!parsed.parsed && record.intent === "learning_planning_preview") {
      parsed.parsed = record as LearningPlanPreview;
      parsed.error = null;
    }
    setPreview(parsed);
    void saveCurrentPlanSnapshot();
    const goalTitle = !isAdaptiveReschedulePreview(parsed.parsed) && typeof parsed.parsed?.goal === "object" && parsed.parsed.goal ? parsed.parsed.goal.title : null;
    if (goalTitle && activeConversationId) {
      const active = conversations.find((item) => item.id === activeConversationId);
      if (active && active.title.startsWith("未命名计划")) void renameConversation(activeConversationId, goalTitle);
    }
    if (isAdaptiveReschedulePreview(parsed.parsed)) {
      setSelectedRescheduleIndexes(
        parsed.parsed.suggestions
          .map((suggestion, index) => suggestion.risk === "low" && suggestion.type !== "split_task" && suggestion.type !== "keep" ? index : -1)
          .filter((index) => index >= 0),
      );
      setRescheduleApplyResults([]);
      setSelectedTaskIndexes([]);
      setApplyResults([]);
      return;
    }
    const flattened = Array.isArray(parsed.parsed?.daily_plan)
      ? parsed.parsed.daily_plan.flatMap((day) => Array.isArray(day.tasks) ? day.tasks : [])
      : Array.isArray(parsed.parsed?.tasks)
        ? parsed.parsed.tasks
        : [];
    const sourceTag = learningPlanSourceTag(parsed.parsed);
    setSelectedTaskIndexes(
      flattened
        .map((task, index) => allTasks.some((existing) => taskDuplicateMatch(existing, previewTaskDraft(task), sourceTag)) ? -1 : index)
        .filter((index) => index >= 0),
    );
    setApplyResults([]);
  };

  const executePendingAction = async (action: PendingAction) => {
    setPendingAction(null);
    await appendVisibleAiMessage("user", "确认");

    // Use store's executePendingAction for batch_delete
    if (action.type === "batch_delete") {
      const storeResult = await useAppStore.getState().executePendingAction();
      const resultMsg = storeResult?.resultMsg ?? "已确认执行。";
      await appendVisibleAiMessage("assistant", resultMsg);
      showToast(resultMsg);
      return;
    }

    if (action.type === "batch_update") {
      const msg = "批量修改需要更具体的指令，请指明要修改哪些任务和具体修改内容。";
      await appendVisibleAiMessage("assistant", msg);
      showToast(msg);
      return;
    }

    await appendVisibleAiMessage("assistant", `已确认执行「${action.summary}」，但当前操作类型未绑定执行器。`);
  };

  const submit = async (message = input) => {
    const text = message.trim();
    if (!text || loading || sendingRef.current) return;
    sendingRef.current = true;
    const requestId = crypto.randomUUID();
    currentRequestRef.current = requestId;

    // --- Unified orchestrator: confirm/cancel, intent routing, tool execution ---
    const { response: orchResponse, handled } = await orchestrateAiInput(text);
    if (handled && orchResponse) {
      setInput("");
      try {
        await appendVisibleAiMessage("user", text);
        await appendVisibleAiMessage("assistant", orchResponse.reply);
        if (orchResponse.reply && !orchResponse.reply.includes("请回复")) showToast(orchResponse.reply);
      } finally {
        sendingRef.current = false;
      }
      return;
    }

    // --- Not handled by orchestrator: delegate to planning/inbox/backend ---
    let route = routePlanningSkill(text, preferredSkill);
    if (!preferredSkill && /没完成|未完成|调整|顺延|重新安排|局部|太多|太满|延期/.test(text)) {
      route = { skill: "adaptive_reschedule", label: "调整计划" };
    } else if (!preferredSkill && /考试|复习|学习|备考|两周|每天|一小时|小时|课程|章节/.test(text)) {
      route = { skill: "exam_review_plan", label: "复习计划" };
    }
    setLastRoute(route);
    setLoading(true);
    setThinkingLabel(route.skill === "adaptive_reschedule" ? "正在整理调整建议" : "正在整理计划");
    setInput("");
    try {
      await appendVisibleAiMessage("user", text);
      if (route.skill === "inbox_capture") {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
        const response = await import("./lib/api").then(({ api }) =>
          api<{ reply: string }>("send_ai_message", {
            message: buildInboxCaptureMessage(text, dayjs().format("YYYY-MM-DD HH:mm:ss"), timezone),
          }),
        );
        const parsed = parseInboxCaptureText(response.reply);
        if (!parsed) {
          await appendVisibleAiMessage("assistant", "这次没有拿到可确认的任务草稿。你可以再补一句更明确的截止时间或提醒时间。");
        } else {
          addEntry({
            id: crypto.randomUUID(),
            role: "assistant",
            kind: "inbox",
            drafts: parsed.items,
            warnings: parsed.warnings ?? [],
            results: [],
          });
          await appendVisibleAiMessage("assistant", "我已经整理出待确认的任务草稿，可以在下方检查时间、提醒和标签后再应用。");
        }
      } else {
        const planningMessage = route.skill === "adaptive_reschedule"
          ? `${buildAdaptiveReschedulePrompt()}\n\n${buildAdaptiveRescheduleContext(allTasks, records, text)}`
          : `${buildPlanningPrompt(route.skill)}\n\n${buildMaterialMetadataSummary(materials)}\n\n${buildTaskLoadSummary(allTasks)}\n\n用户输入：${text}`;
        const response = await import("./lib/api").then(({ api }) =>
          api<{ reply?: string; summary?: string }>("send_ai_message", {
            message: planningMessage,
          }),
        );
        updatePreviewFromResponse(response);
        const parsed = parseLearningPlanText(response.reply ?? JSON.stringify(response));
        await appendVisibleAiMessage("assistant", planningChatSummary(parsed, response, route.skill));
      }
    } catch (error) {
      if (currentRequestRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : "这次处理失败了，请再试一次。";
      await appendVisibleAiMessage("assistant", message);
      showToast(message);
    } finally {
      if (currentRequestRef.current === requestId) {
        setLoading(false);
        setThinkingLabel("");
        setAiPreferredSkill(null);
      }
      sendingRef.current = false;
    }
  };

  const patchInboxDraft = (entryId: string, index: number, patch: Partial<InboxDraft>) =>
    updateInboxEntry(entryId, (entry) => ({
      ...entry,
      drafts: entry.drafts.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, edited: true } : item),
    }));

  const confirmInboxDrafts = async (entryId: string) => {
    const entry = entries.find((item): item is Extract<AiWorkspaceEntry, { kind: "inbox" }> => item.id === entryId && item.kind === "inbox");
    if (!entry) return;
    const results: Array<{ title: string; status: "success" | "failed"; message: string }> = [];
    for (const draft of entry.drafts) {
      try {
        const task = await createTask({
          ...emptyDraft,
          title: draft.title,
          description: draft.notes,
          deadline: draft.deadline ?? "",
          planned_date: draft.planned_date ?? "",
          estimated_duration: draft.estimated_duration == null ? "" : String(draft.estimated_duration),
          urgency: draft.urgency ? "urgent" : "not_urgent",
          importance: draft.importance ? "important" : "not_important",
          tags: draft.tags.join(", "),
        });
        if (draft.reminder_at) {
          await createReminder({ task_id: task.id, title: draft.title, remind_at: toLocalIso(draft.reminder_at) ?? draft.reminder_at });
        }
        results.push({ title: draft.title, status: "success", message: draft.reminder_at ? "任务与提醒已创建" : "任务已创建" });
      } catch (error) {
        results.push({ title: draft.title, status: "failed", message: error instanceof Error ? error.message : "创建失败" });
      }
    }
    updateInboxEntry(entryId, (current) => ({ ...current, results }));
  };

  const applySelectedTasks = async () => {
    if (selectedTasks.length === 0) return;
    if (!window.confirm(`确认将 ${selectedTasks.length} 个勾选任务应用到任务列表吗？只会写入现有字段，不会直接写入 quadrant。`)) return;
    const results: Array<{ title: string; status: "success" | "skipped_duplicate" | "failed"; message: string }> = [];
    const sourceTag = learningPlanSourceTag(preview.parsed);
    for (const task of selectedTasks) {
      const draft = previewTaskDraft(task);
      const duplicate = allTasks.find((existing) => taskDuplicateMatch(existing, draft, sourceTag));
      try {
        if (duplicate && !window.confirm(`“${draft.title}” 可能已存在，仍要强制创建吗？`)) {
          results.push({ title: draft.title, status: "skipped_duplicate", message: "检测到可能重复，已跳过" });
          continue;
        }
        await createTask({ ...draft, tags: [draft.tags, sourceTag].filter(Boolean).join(", ") });
        results.push({ title: draft.title, status: "success", message: "应用成功" });
      } catch (error) {
        results.push({ title: draft.title, status: "failed", message: error instanceof Error ? error.message : "创建失败" });
      }
    }
    setApplyResults(results);
    await appendVisibleAiMessage(
      "assistant",
      `应用结果：成功 ${results.filter((item) => item.status === "success").length} 项，跳过 ${results.filter((item) => item.status === "skipped_duplicate").length} 项，失败 ${results.filter((item) => item.status === "failed").length} 项。`,
    );
    await saveCurrentPlanSnapshot();
  };

  const applySelectedRescheduleSuggestions = async () => {
    if (!isAdaptiveReschedulePreview(preview.parsed) || selectedRescheduleSuggestions.length === 0) return;
    if (!window.confirm(`???? ${selectedRescheduleSuggestions.length} ????????????? planned_date?estimated_duration ??? tags?`)) return;
    const results: Array<{ title: string; status: "applied" | "skipped" | "failed"; message: string }> = [];
    for (const suggestion of selectedRescheduleSuggestions) {
      const task = allTasks.find((item) => item.id === suggestion.task_id);
      if (!task) {
        results.push({ title: suggestion.task_title, status: "failed", message: "???????" });
        continue;
      }
      try {
        if (suggestion.type === "keep") {
          results.push({ title: suggestion.task_title, status: "skipped", message: "?????" });
          continue;
        }
        if (suggestion.type === "split_task") {
          results.push({ title: suggestion.task_title, status: "skipped", message: "这次处理失败了，请再试一次。" });
          continue;
        }
        const patch: TaskUpdatePatch = { id: task.id };
        if (suggestion.type === "move_task" && suggestion.suggested_planned_date) patch.planned_date = suggestion.suggested_planned_date;
        if (suggestion.type === "estimate_duration" && suggestion.suggested_estimated_duration != null) patch.estimated_duration = suggestion.suggested_estimated_duration;
        if (suggestion.type === "mark_needs_review") patch.tags = [...new Set([...parseTags(task), ...suggestion.add_tags])];
        if (Object.keys(patch).length === 1) {
          results.push({ title: suggestion.task_title, status: "skipped", message: "??????????" });
          continue;
        }
        await useAppStore.getState().updateTask(patch);
        results.push({ title: suggestion.task_title, status: "applied", message: "???" });
      } catch (error) {
        results.push({ title: suggestion.task_title, status: "failed", message: error instanceof Error ? error.message : "????" });
      }
    }
    await useAppStore.getState().load();
    setRescheduleApplyResults(results);
    await appendVisibleAiMessage(
      "assistant",
      `????????applied ${results.filter((item) => item.status === "applied").length}?skipped ${results.filter((item) => item.status === "skipped").length}?failed ${results.filter((item) => item.status === "failed").length}?`,
    );
    await saveCurrentPlanSnapshot();
  };

  const submitStudyDraft = async () => {
    const compactOutline = studyDraft.outline.trim();
    const prompt = [
      `请为我建立学习项目。`,
      studyDraft.title && `学习目标标题：${studyDraft.title}`,
      studyDraft.subject && `科目：${studyDraft.subject}`,
      studyDraft.examType && `考试类型：${studyDraft.examType}`,
      studyDraft.deadline && `截止日期：${studyDraft.deadline}`,
      studyDraft.dailyMinutes && `每天可用时间：${studyDraft.dailyMinutes} 分钟`,
      studyDraft.restDays && `休息日：${studyDraft.restDays}`,
      studyDraft.currentLevel && `当前基础：${studyDraft.currentLevel}`,
      compactOutline && `大纲 / 目录 / 考试范围：\n${compactOutline}`,
      studyDraft.note && `备注：${studyDraft.note}`,
    ].filter(Boolean).join("\n");
    await submit(prompt);
    setStudyDrawerOpen(false);
  };

  const saveOutlineMaterial = async () => {
    if (!studyDraft.outline.trim()) {
      showToast("先贴一段大纲或目录，我再帮你保存。");
      return;
    }
    const note = JSON.stringify({
      kind: "learning_outline",
      summary: preview.parsed?.summary ?? null,
      chapters: !isAdaptiveReschedulePreview(preview.parsed) ? preview.parsed?.chapters ?? [] : [],
      raw_outline_excerpt: studyDraft.outline.trim().slice(0, 1200),
      memo: studyDraft.note || null,
    });
    await createMaterial({
      name: studyDraft.title || `${studyDraft.subject || "学习项目"}大纲`,
      path: `inline://learning-outline/${crypto.randomUUID()}`,
      file_type: "text",
      size_bytes: new Blob([studyDraft.outline]).size,
      subject: studyDraft.subject || null,
      exam_type: studyDraft.examType || null,
      tags: ["学习", studyDraft.examType, studyDraft.subject].filter(Boolean),
      note,
      status: "metadata_only",
    });
    showToast("学习项目摘要已保存到资料库。");
  };

  return (
    <section className="glass-card ai-workspace flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <Header title="AI 计划编排" subtitle="用自然语言记录任务、安排计划、调整日程" />
        <div className="flex shrink-0 gap-2">
          <button className="glass-inset px-3 py-2 text-sm" type="button" onClick={() => setHistoryDialogOpen(true)}>
            历史记录
          </button>
        </div>
      </div>
      <div className="ai-dialogue-shell mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="glass-inset flex min-h-[520px] min-w-0 flex-col overflow-hidden p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span className="rounded-full border border-white/10 px-2 py-1">{lastRoute.label === "自动判断" ? "自动判断" : `自动识别：${lastRoute.label}`}</span>
            <span className="rounded-full border border-white/10 px-2 py-1">
              {preferredSkill ? `已指定：${AI_PLANNING_SKILLS[preferredSkill].title}` : "自动判断"}
            </span>
          </div>
          <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {entries.length === 0 && (
              <div className="glass-inset max-w-2xl p-5 text-sm leading-7">
                告诉我你想记录、规划或调整什么。例如：“下周三之前交发展经济学作业，周二晚上提醒我写提纲”，或者“我两周后期末考试，每天学两小时，帮我安排复习”。
              </div>
            )}
            {entries.slice(-40).map((entry) => entry.kind === "message" ? (
              <div key={entry.id} className={`chat-bubble max-w-[82%] rounded-xl text-sm leading-6 ${entry.role === "user" ? "chat-bubble-user btn-glow ml-auto text-[var(--primary-foreground)]" : "chat-bubble-ai glass-inset mr-auto"}`}>
                {entry.content}
              </div>
            ) : (
              <InboxDraftCard
                key={entry.id}
                entry={entry}
                onPatch={(index, patch) => patchInboxDraft(entry.id, index, patch)}
                onConfirm={() => confirmInboxDrafts(entry.id)}
                onCancel={() => updateInboxEntry(entry.id, (current) => ({ ...current, drafts: [], warnings: [], results: [] }))}
              />
            ))}
            {pendingAction && !loading && (
              <div className="glass-inset mr-auto max-w-[82%] space-y-2 rounded-xl border border-[var(--neon-amber)]/30 p-3 text-sm">
                <p className="text-[var(--neon-amber)]">⚠️ 待确认操作</p>
                <p>{pendingAction.summary}</p>
                {pendingAction.affectedCount > 0 && (
                  <p className="text-xs text-[var(--muted-foreground)]">影响 {pendingAction.affectedCount} 个任务</p>
                )}
                {pendingAction.affectedPreview.length > 0 && (
                  <ul className="text-xs text-[var(--muted-foreground)] space-y-0.5">
                    {pendingAction.affectedPreview.map((title, i) => <li key={i}>• {title}</li>)}
                  </ul>
                )}
                <p className="text-xs text-[var(--muted-foreground)]">将任务移动到回收站，可在回收站恢复。</p>
                <div className="flex gap-2 pt-1">
                  <button className="btn-glow rounded-lg px-3 py-1.5 text-xs font-semibold" type="button" onClick={() => { void executePendingAction(pendingAction); }}>确认执行</button>
                  <button className="glass-inset rounded-lg px-3 py-1.5 text-xs" type="button" onClick={() => { setPendingAction(null); showToast("已取消。"); }}>取消</button>
                </div>
              </div>
            )}
            {thinkingLabel && (
              <div className="chat-bubble chat-bubble-ai glass-inset mr-auto inline-flex items-center gap-2 rounded-xl text-sm leading-6">
                <span>{thinkingLabel}</span>
                <span className="typing-dots" aria-label="正在生成"><span /><span /><span /></span>
              </div>
            )}
          </div>
          {(preview.parsed || preview.error) && (
            <button className="glass-inset mt-3 flex flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" type="button" onClick={() => toggleAiToolPanel("plan")}>
              <span className="font-medium">计划结果</span>
              <span className="text-[var(--muted-foreground)]">
                {preview.parsed ? `${tasks.length} 个任务 · ${stringList(preview.parsed.warnings).length} 条风险提醒` : "解析失败，可查看原文"} · 点击展开计划结果
              </span>
            </button>
          )}
          <div className="relative mt-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex flex-wrap gap-2 text-xs" data-ai-toolbar>
              <button className={`glass-inset px-3 py-1.5 ${activeAiToolPanel === "materials" ? "btn-glow" : ""}`} type="button" onClick={() => toggleAiToolPanel("materials")}>添加资料</button>
              <button className={`glass-inset px-3 py-1.5 ${activeAiToolPanel === "plan" ? "btn-glow" : ""}`} type="button" onClick={() => toggleAiToolPanel("plan")} disabled={!preview.parsed}>计划结果</button>
              <button className={`glass-inset px-3 py-1.5 ${activeAiToolPanel === "reminders" ? "btn-glow" : ""}`} type="button" onClick={() => toggleAiToolPanel("reminders")}>提醒</button>
              <button className={`glass-inset px-3 py-1.5 ${preferredSkill === "adaptive_reschedule" ? "btn-glow" : ""}`} type="button" onClick={() => {
                setAiPreferredSkill("adaptive_reschedule");
                showToast("已切到局部重排；直接描述哪里没完成或哪里太满。");
              }}>局部重排</button>
              <button className={`glass-inset px-3 py-1.5 ${activeAiToolPanel === "more" ? "btn-glow" : ""}`} type="button" onClick={() => toggleAiToolPanel("more")}>更多</button>
              <button className={`glass-inset px-3 py-1.5 ${activeAiToolPanel === "quick" ? "btn-glow" : ""}`} type="button" onClick={() => toggleAiToolPanel("quick")}>/ 快捷</button>
            </div>
            {activeAiToolPanel && activeAiToolPanel !== "plan" && (
              <div className="ai-tool-panel ai-popover glass-card absolute bottom-[84px] left-0 z-[60] w-[min(360px,calc(100vw-48px))] p-3 text-sm">
                {activeAiToolPanel === "quick" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className={`glass-inset px-3 py-2 text-left ${preferredSkill == null ? "btn-glow" : ""}`} type="button" onClick={() => { setAiPreferredSkill(null); showToast("已切回自动判断。"); setActiveAiToolPanel(null); }}>
                      自动判断
                    </button>
                    {Object.entries(AI_PLANNING_SKILLS).map(([id, skill]) => (
                      <button key={id} className={`glass-inset px-3 py-2 text-left ${preferredSkill === id ? "btn-glow" : ""}`} type="button" onClick={() => {
                        const nextSkill = id as PlanningSkillId;
                        const shouldClear = preferredSkill === nextSkill;
                        setAiPreferredSkill(shouldClear ? null : nextSkill);
                        showToast(shouldClear ? "已切回自动判断。" : `已选择：${skill.title}。在下一条消息中生效。`);
                        setActiveAiToolPanel(null);
                      }}>
                        {skill.title}
                      </button>
                    ))}
                    <button className="glass-inset px-3 py-2 text-left" type="button" onClick={() => { setStudyDrawerOpen(true); setActiveAiToolPanel(null); }}>建立学习项目</button>
                    <button className="glass-inset px-3 py-2 text-left" type="button" onClick={() => { setStudyDrawerOpen(true); setActiveAiToolPanel(null); }}>粘贴大纲生成计划</button>
                    <button className="glass-inset px-3 py-2 text-left" type="button" onClick={() => { setAiPreferredSkill("material_planning"); showToast("可以直接说：根据已有资料生成复习计划。"); setActiveAiToolPanel(null); }}>根据资料生成复习计划</button>
                  </div>
                )}
                {activeAiToolPanel === "materials" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold">资料库</h4>
                      <span className="text-xs text-[var(--muted-foreground)]">只保存元数据</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-glow rounded-xl px-3 py-1.5 text-xs" type="button" onClick={async () => { const added = await addMaterialFiles(); showToast(added.length ? `已添加 ${added.length} 个资料记录` : "未选择文件"); }}>添加文件</button>
                      <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={async () => { const added = await addMaterialFolder(); showToast(added ? "已添加文件夹记录" : "未选择文件夹"); }}>添加文件夹</button>
                      <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={() => { setStudyDrawerOpen(true); setActiveAiToolPanel(null); }}>粘贴大纲 / 目录</button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <input className="field min-w-0" value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="搜索资料" />
                      <select className="field" value={materialStatusFilter} onChange={(event) => setMaterialStatusFilter(event.target.value as typeof materialStatusFilter)}>
                        <option value="all">全部状态</option>
                        <option value="metadata_only">metadata_only</option>
                        <option value="missing">missing</option>
                        <option value="queued">queued</option>
                        <option value="parsed">parsed</option>
                        <option value="failed">failed</option>
                      </select>
                    </div>
                    {materialsError && <p className="text-xs text-[var(--prio-p1)]">{materialsError}</p>}
                    {materialsLoading ? <p className="text-[var(--muted-foreground)]">加载中...</p> : visibleMaterials.length === 0 ? (
                      <p className="text-[var(--muted-foreground)]">还没有资料记录。添加后，AI 只能使用名称、类型、科目、标签和备注做规划。</p>
                    ) : (
                      <div className="thin-scrollbar max-h-[360px] space-y-2 overflow-auto pr-1">
                        {visibleMaterials.map((material) => {
                          let tags: string[] = [];
                          try { tags = JSON.parse(material.tags) as string[]; } catch { tags = []; }
                          const editing = editingMaterialId === material.id;
                          return (
                            <div key={material.id} className="glass-inset space-y-2 p-3 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{material.name}</p>
                                  <p className="text-[var(--muted-foreground)]">{material.file_type} · {material.subject || "未设科目"} · {material.status}</p>
                                </div>
                                <button className="glass-inset px-2 py-1" type="button" onClick={() => { navigator.clipboard.writeText(material.path); showToast("路径已复制"); }}>复制路径</button>
                              </div>
                              <p className="text-[var(--muted-foreground)]">{formatMaterialSize(material.size_bytes)} · {dayjs(material.created_at).format("YYYY-MM-DD HH:mm")}</p>
                              <p>{tags.length ? tags.join(" / ") : "无标签"}</p>
                              <p className="line-clamp-2 text-[var(--muted-foreground)]">{material.note || "无备注"}</p>
                              {editing && (
                                <div className="space-y-2">
                                  <input className="field w-full" value={materialDraft.subject} onChange={(event) => setMaterialDraft((draft) => ({ ...draft, subject: event.target.value }))} placeholder="科目" />
                                  <input className="field w-full" value={materialDraft.tags} onChange={(event) => setMaterialDraft((draft) => ({ ...draft, tags: event.target.value }))} placeholder="标签，逗号分隔" />
                                  <textarea className="field min-h-20 w-full" value={materialDraft.note} onChange={(event) => setMaterialDraft((draft) => ({ ...draft, note: event.target.value }))} placeholder="备注" />
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {editing ? (
                                  <button className="btn-glow rounded-xl px-3 py-1.5" type="button" onClick={async () => { await updateMaterial({ id: material.id, subject: materialDraft.subject || null, tags: materialDraft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), note: materialDraft.note || null }); setEditingMaterialId(null); showToast("资料已更新"); }}>保存</button>
                                ) : (
                                  <button className="glass-inset px-3 py-1.5" type="button" onClick={() => { setEditingMaterialId(material.id); setMaterialDraft({ subject: material.subject ?? "", tags: tags.join(", "), note: material.note ?? "" }); }}>编辑</button>
                                )}
                                <button className="glass-inset px-3 py-1.5" type="button" onClick={async () => { if (!window.confirm("仅从资料库移除，不删除原文件。")) return; await removeMaterialRecord(material.id); showToast("已从资料库移除"); }}>移除</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {activeAiToolPanel === "reminders" && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">提醒中心</h4>
                    {reminders.length === 0 ? (
                      <p className="text-[var(--muted-foreground)]">暂无提醒。创建任务时可以设置提醒时间。</p>
                    ) : (
                      <div className="thin-scrollbar max-h-[280px] space-y-2 overflow-auto">
                        {(() => {
                          const triggered = reminders.filter((r) => r.status === "triggered");
                          const upcoming = reminders.filter((r) => r.status === "pending");
                          return (
                            <>
                              {triggered.length > 0 && (
                                <>
                                  <p className="text-xs font-semibold text-[var(--neon-pink)]">🔔 已触发 ({triggered.length})</p>
                                  {triggered.slice(0, 5).map((r) => (
                                    <div key={r.id} className="glass-inset p-2 text-xs"><p className="font-medium">{r.title}</p><p className="text-[var(--muted-foreground)]">{dayjs(r.remind_at).format("MM-DD HH:mm")}</p></div>
                                  ))}
                                </>
                              )}
                              {upcoming.length > 0 && (
                                <>
                                  <p className="text-xs font-semibold text-[var(--muted-foreground)] mt-2">⏳ 即将到来 ({upcoming.length})</p>
                                  {upcoming.slice(0, 5).map((r) => (
                                    <div key={r.id} className="glass-inset p-2 text-xs"><p className="font-medium">{r.title}</p><p className="text-[var(--muted-foreground)]">{dayjs(r.remind_at).format("MM-DD HH:mm")}</p></div>
                                  ))}
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <button className="glass-inset px-3 py-1.5 text-xs w-full" type="button" onClick={() => setActiveAiToolPanel(null)}>关闭</button>
                  </div>
                )}
                {activeAiToolPanel === "more" && (
                  <div className="space-y-2">
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => { showToast("AI 工作流：说出目标 → AI 规划 → 预览 → 确认 → 应用为任务。整个过程对话优先。"); setActiveAiToolPanel(null); }}>📋 AI 工作流说明</button>
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => { showToast("AI 只使用任务、日期、目标和资料摘要，不反复索取无关上下文。资料全文解析留给后续 Sprint。"); setActiveAiToolPanel(null); }}>📉 低 token 使用说明</button>
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => { showToast("SmartFocus 负责计划、任务、日程和计时；LearnKATA 负责讲解、练习、测验和掌握度。两者通过 learnkata_links 联动。"); setActiveAiToolPanel(null); }}>🔗 LearnKATA 联动边界</button>
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => { setTrashDialogOpen(true); setActiveAiToolPanel(null); }}>🗑️ 回收站</button>
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => { setInput(""); setActiveAiToolPanel(null); }}>✕ 清空当前输入</button>
                    <button className="glass-inset block w-full px-3 py-2 text-left text-sm" type="button" onClick={() => setActiveAiToolPanel(null)}>✕ 关闭</button>
                  </div>
                )}
              </div>
            )}
            <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <textarea
                className="glass-inset min-h-12 min-w-0 resize-none px-4 py-3 text-sm outline-none [transition:var(--transition-smooth)] focus:border-[var(--ring)]"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || isComposing || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  void submit();
                }}
                placeholder="说出你想记录、规划或调整的事情..."
              />
              <button className="btn-glow grid h-12 w-14 place-items-center rounded-xl text-sm font-semibold" type="submit" disabled={loading} title="发送" aria-label="发送">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
        {(preview.parsed || preview.error) && (
          <aside className={`ai-plan-drawer glass-inset thin-scrollbar min-h-0 overflow-y-auto p-4 ${activeAiToolPanel === "plan" ? "is-open" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-label">计划结果</p>
                <h3 className="mt-2 font-semibold">结构化计划预览</h3>
              </div>
              <button className="glass-inset px-3 py-1.5 text-xs xl:hidden" type="button" onClick={() => setActiveAiToolPanel(null)}>✕</button>
            </div>
            {preview.parsed ? (
              <PlanCanvasBody
                preview={preview}
                tasks={tasks}
                selectedTaskIndexes={selectedTaskIndexes}
                setSelectedTaskIndexes={setSelectedTaskIndexes}
                selectedTasks={selectedTasks}
                applySelectedTasks={applySelectedTasks}
                applyResults={applyResults}
                selectedRescheduleIndexes={selectedRescheduleIndexes}
                setSelectedRescheduleIndexes={setSelectedRescheduleIndexes}
                selectedRescheduleSuggestions={selectedRescheduleSuggestions}
                applySelectedRescheduleSuggestions={applySelectedRescheduleSuggestions}
                rescheduleApplyResults={rescheduleApplyResults}
              />
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <PreviewBlock title="解析失败">
                  <p>计划结果解析失败，可查看原文。</p>
                </PreviewBlock>
                {preview.raw && (
                  <details className="glass-inset p-3">
                    <summary className="cursor-pointer font-medium">原文 / Debug</summary>
                    <pre className="thin-scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">{preview.raw}</pre>
                  </details>
                )}
              </div>
            )}
          </aside>
        )}
        {studyDrawerOpen && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-3 sm:items-center">
            <div className="glass-card thin-scrollbar max-h-[88vh] w-full max-w-2xl overflow-y-auto p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-label">学习项目</p>
                  <h3 className="mt-2 font-semibold">粘贴大纲生成计划</h3>
                </div>
                <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={() => setStudyDrawerOpen(false)}>✕</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input className="field" value={studyDraft.title} onChange={(e) => setStudyDraft((d) => ({ ...d, title: e.target.value }))} placeholder="学习目标标题" />
                <input className="field" value={studyDraft.subject} onChange={(e) => setStudyDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="科目" />
                <select className="field" value={studyDraft.examType} onChange={(e) => setStudyDraft((d) => ({ ...d, examType: e.target.value }))}>
                  <option>期末</option><option>考研</option><option>考公</option><option>课程学习</option><option>其他</option>
                </select>
                <input className="field" type="date" value={studyDraft.deadline} onChange={(e) => setStudyDraft((d) => ({ ...d, deadline: e.target.value }))} />
                <input className="field" inputMode="numeric" value={studyDraft.dailyMinutes} onChange={(e) => setStudyDraft((d) => ({ ...d, dailyMinutes: e.target.value }))} placeholder="每天可用时间（分钟，可选）" />
                <input className="field" value={studyDraft.restDays} onChange={(e) => setStudyDraft((d) => ({ ...d, restDays: e.target.value }))} placeholder="休息日，如 Sunday（可选）" />
                <input className="field sm:col-span-2" value={studyDraft.currentLevel} onChange={(e) => setStudyDraft((d) => ({ ...d, currentLevel: e.target.value }))} placeholder="当前基础（可选）" />
                <textarea className="field min-h-36 sm:col-span-2" value={studyDraft.outline} onChange={(e) => setStudyDraft((d) => ({ ...d, outline: e.target.value }))} placeholder="粘贴课程大纲 / 章节目录 / 考试范围 / 老师重点" />
                <textarea className="field min-h-20 sm:col-span-2" value={studyDraft.note} onChange={(e) => setStudyDraft((d) => ({ ...d, note: e.target.value }))} placeholder="备注（可选）" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-glow rounded-xl px-4 py-2 text-sm" type="button" onClick={() => void submitStudyDraft()}>生成学习计划草稿</button>
                <button className="glass-inset px-4 py-2 text-sm" type="button" onClick={() => void saveOutlineMaterial()}>保存为资料摘要</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {historyDialogOpen && createPortal(
        <div className="ai-history-backdrop" role="presentation" onMouseDown={() => setHistoryDialogOpen(false)}>
          <section className="ai-history-dialog glass-card" role="dialog" aria-modal="true" aria-label="历史记录" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-semibold">历史记录</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">这里只保留用户可见消息；内部规划上下文不会进入列表。</p>
              </div>
              <div className="flex gap-2">
                <button className="glass-inset px-3 py-2 text-sm" type="button" onClick={() => void createConversation()}>新建对话</button>
                <button className="glass-inset px-3 py-2 text-sm" type="button" onClick={() => setHistoryDialogOpen(false)}>关闭</button>
              </div>
            </div>
            <input className="field mt-4 w-full" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="搜索标题或摘要" />
            <div className="thin-scrollbar mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {conversations
                .map((item) => ({ item, meta: historyDetails[item.id] }))
                .filter(({ item, meta }) => `${meta?.title ?? item.title} ${meta?.summary ?? ""}`.toLowerCase().includes(historySearch.toLowerCase()))
                .map(({ item, meta }) => (
                  <div key={item.id} className={`rounded-2xl border p-4 ${item.id === activeConversationId ? "border-[var(--ring)] bg-white/[0.04]" : "border-white/10"}`}>
                    <button className="block w-full text-left" type="button" onClick={() => { void openConversation(item.id); setHistoryDialogOpen(false); }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{meta?.title ?? item.title}</p>
                        <span className="text-xs text-[var(--muted-foreground)]">{dayjs(item.updated_at).format("YYYY-MM-DD HH:mm")}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--muted-foreground)]">{meta?.summary ?? "正在读取摘要..."}</p>
                      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                        {meta?.messageCount ?? 0} 条消息 · {meta?.hasPlan ? "有关联 Plan Canvas" : "无关联 Plan Canvas"}
                      </p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={() => {
                        const next = window.prompt("重命名对话", meta?.title ?? item.title);
                        if (next?.trim()) void renameConversation(item.id, next.trim());
                      }}>重命名</button>
                      <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={() => {
                        if (window.confirm("只删除 AI 对话历史，不删除任务、资料、提醒。继续吗？")) void deleteConversation(item.id);
                      }}>删除</button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>,
        document.body,
      )}
      {trashDialogOpen && createPortal(
        <TrashDialog onClose={() => setTrashDialogOpen(false)} />,
        document.body,
      )}
      {(preview.parsed || preview.error) && activeAiToolPanel === "plan" && <button className="ai-drawer-backdrop xl:hidden" type="button" aria-label="关闭计划结果" onClick={() => setActiveAiToolPanel(null)} />}
    </section>
  );
}

function TrashDialog({ onClose }: { onClose: () => void }) {
  const { trashedTasks, trashLoading, trashError, loadTrashedTasks, restoreTaskFromTrash, deleteTaskPermanently } = useAppStore();
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { void loadTrashedTasks(); }, [loadTrashedTasks]);

  const filtered = trashedTasks.filter((task) => {
    const haystack = `${task.title} ${task.tags} ${task.description ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const handlePermanentDelete = async (id: string) => {
    try {
      await deleteTaskPermanently(id);
      showToast("已彻底删除");
      setConfirmDeleteId(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreTaskFromTrash(id);
      showToast("已恢复任务");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "恢复失败");
    }
  };

  const quadrantLabel = (q: number) => ["Q1 重要且紧急", "Q2 重要不紧急", "Q3 紧急不重要", "Q4 不重要不紧急"][q - 1] ?? `Q${q}`;

  return (
    <div className="ai-history-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ai-history-dialog glass-card" role="dialog" aria-modal="true" aria-label="回收站" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-semibold">回收站</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">删除的任务会先放在这里，可恢复。</p>
          </div>
          <div className="flex gap-2">
            <button className="glass-inset px-3 py-2 text-sm" type="button" onClick={() => void loadTrashedTasks()}>刷新</button>
            <button className="glass-inset px-3 py-2 text-sm" type="button" onClick={onClose}>关闭</button>
          </div>
        </div>
        <input className="field mt-4 w-full" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务标题、标签、备注" />
        <div className="thin-scrollbar mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {trashLoading && <p className="text-sm text-[var(--muted-foreground)]">加载中...</p>}
          {trashError && <p className="text-sm text-red-400">{trashError}</p>}
          {!trashLoading && filtered.length === 0 && (
            <div className="glass-inset p-6 text-center text-sm text-[var(--muted-foreground)]">
              回收站为空。删除的任务会先放在这里，可恢复。
            </div>
          )}
          {filtered.map((task) => {
            const tags = (() => { try { return JSON.parse(task.tags) as string[]; } catch { return []; } })();
            return (
              <div key={task.id} className="rounded-2xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{task.title}</p>
                  <span className="text-xs text-[var(--muted-foreground)]">Q{task.quadrant} {quadrantLabel(task.quadrant)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                  {task.planned_date && <span>计划: {task.planned_date}</span>}
                  {task.deadline && <span>截止: {task.deadline.slice(0, 10)}</span>}
                  {task.trashed_at && <span>删除于: {dayjs(task.trashed_at).format("YYYY-MM-DD HH:mm")}</span>}
                  {task.trash_reason && <span>原因: {task.trash_reason}</span>}
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((tag, i) => <span key={i} className="rounded-full border border-white/10 px-2 py-0.5 text-xs">{tag}</span>)}
                  </div>
                )}
                {task.description && (
                  <p className="mt-2 line-clamp-1 text-sm text-[var(--muted-foreground)]">{task.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="glass-inset flex items-center gap-1.5 px-3 py-1.5 text-xs" type="button" onClick={() => void handleRestore(task.id)}>
                    <RotateCcw size={13} /> 恢复
                  </button>
                  {confirmDeleteId === task.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">彻底删除后无法恢复，是否继续？</span>
                      <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white" type="button" onClick={() => void handlePermanentDelete(task.id)}>确认</button>
                      <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={() => setConfirmDeleteId(null)}>取消</button>
                    </div>
                  ) : (
                    <button className="glass-inset flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400" type="button" onClick={() => setConfirmDeleteId(task.id)}>
                      <Trash2 size={13} /> 彻底删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InboxDraftCard({ entry, onPatch, onConfirm, onCancel }: {
  entry: Extract<AiWorkspaceEntry, { kind: "inbox" }>;
  onPatch: (index: number, patch: Partial<InboxDraft>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (entry.drafts.length === 0) return <div className="glass-inset max-w-[82%] p-4 text-sm">已取消这组草稿。</div>;
  return (
    <section className="glass-inset max-w-[92%] p-3 text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">我先整理成草稿，你确认后再创建</span>
        <span className="text-xs text-[var(--muted-foreground)]">{entry.drafts.length} 项</span>
      </div>
      <div className="space-y-3">
        {entry.drafts.map((draft, index) => (
          <div key={`${draft.title}-${index}`} className="rounded-xl border border-white/10 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <input className="field" value={draft.title} onChange={(event) => onPatch(index, { title: event.target.value })} />
              <input className="field" type="datetime-local" value={(draft.reminder_at ?? "").slice(0, 16)} onChange={(event) => onPatch(index, { reminder_at: event.target.value || null })} />
              <input className="field" type="datetime-local" value={(draft.deadline ?? "").slice(0, 16)} onChange={(event) => onPatch(index, { deadline: event.target.value || null })} />
              <input className="field" type="date" value={draft.planned_date ?? ""} onChange={(event) => onPatch(index, { planned_date: event.target.value || null })} />
              <input className="field" type="number" min="0" placeholder="预计分钟" value={draft.estimated_duration ?? ""} onChange={(event) => onPatch(index, { estimated_duration: event.target.value ? Number(event.target.value) : null })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="field" value={draft.urgency} onChange={(event) => onPatch(index, { urgency: Number(event.target.value) as 0 | 1 })}>
                  <option value={0}>不紧急</option><option value={1}>紧急</option>
                </select>
                <select className="field" value={draft.importance} onChange={(event) => onPatch(index, { importance: Number(event.target.value) as 0 | 1 })}>
                  <option value={0}>不重要</option><option value={1}>重要</option>
                </select>
              </div>
            </div>
            <textarea className="field mt-2 min-h-16 w-full" value={draft.notes} onChange={(event) => onPatch(index, { notes: event.target.value })} />
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 px-2 py-1" >置信度 {Math.round((draft.confidence ?? 0) * 100)}%</span>
              <span className="rounded-full border border-white/10 px-2 py-1">tags {draft.tags.join(" / ") || "-"}</span>
            </div>
            {draft.clarification_questions.length > 0 && <p className="mt-2 text-xs text-[var(--neon-amber)]">{draft.clarification_questions.join(" / ")}</p>}
          </div>
        ))}
      </div>
      {entry.warnings.length > 0 && <p className="mt-3 text-xs text-[var(--neon-amber)]">{entry.warnings.join(" / ")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-glow rounded-xl px-4 py-2 text-sm" type="button" onClick={onConfirm}>??</button>
        <button className="glass-inset px-4 py-2 text-sm" type="button" onClick={onCancel}>??</button>
      </div>
      {entry.results.length > 0 && <div className="mt-3 space-y-1 text-xs">{entry.results.map((item) => <p key={item.title} className={item.status === "success" ? "text-[var(--neon-blue)]" : "text-[var(--neon-pink)]"}>{item.title}：{item.message}</p>)}</div>}
    </section>
  );
}

function PlanCanvasBody({ preview, tasks, selectedTaskIndexes, setSelectedTaskIndexes, selectedTasks, applySelectedTasks, applyResults, selectedRescheduleIndexes, setSelectedRescheduleIndexes, selectedRescheduleSuggestions, applySelectedRescheduleSuggestions, rescheduleApplyResults }: {
  preview: StructuredPreviewState;
  tasks: LearningTaskPreview[];
  selectedTaskIndexes: number[];
  setSelectedTaskIndexes: Dispatch<SetStateAction<number[]>>;
  selectedTasks: LearningTaskPreview[];
  applySelectedTasks: () => Promise<void>;
  applyResults: Array<{ title: string; status: "success" | "skipped_duplicate" | "failed"; message: string }>;
  selectedRescheduleIndexes: number[];
  setSelectedRescheduleIndexes: Dispatch<SetStateAction<number[]>>;
  selectedRescheduleSuggestions: AdaptiveReschedulePreview["suggestions"];
  applySelectedRescheduleSuggestions: () => Promise<void>;
  rescheduleApplyResults: Array<{ title: string; status: "applied" | "skipped" | "failed"; message: string }>;
}) {
  if (!preview.parsed) return null;
  if (isAdaptiveReschedulePreview(preview.parsed)) {
    const reschedule = preview.parsed;
    return (
      <div className="mt-4 space-y-3 text-sm">
        <PreviewBlock title="局部重排概览">
          <p>{reschedule.summary || "暂无概览"}</p>
          <p className="mt-2 text-[var(--muted-foreground)]">{reschedule.reason || "暂无原因说明"}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p>策略：{reschedule.reschedule_scope.strategy}</p>
            <p>影响任务：{reschedule.reschedule_scope.affected_task_count}</p>
            <p className="sm:col-span-2">覆盖日期：{reschedule.reschedule_scope.date_range.join(" ~ ")}</p>
          </div>
        </PreviewBlock>
        {stringList(reschedule.clarification_questions).length > 0 && (
          <PreviewBlock title="待补充信息">
            <ul className="list-disc space-y-1 pl-5">{stringList(reschedule.clarification_questions).map((item) => <li key={item}>{item}</li>)}</ul>
          </PreviewBlock>
        )}
        <PreviewBlock title={`调整建议 (${reschedule.suggestions.length})`}>
          <div className="space-y-3">
            {reschedule.suggestions.map((suggestion, index) => {
              const disabled = suggestion.type === "split_task" || suggestion.type === "keep";
              return (
                <label key={`${suggestion.task_id}-${index}`} className="block rounded-xl border border-white/10 p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedRescheduleIndexes.includes(index)}
                      disabled={disabled}
                      onChange={() => setSelectedRescheduleIndexes((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold">{suggestion.task_title}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {suggestion.type} · 风险 {suggestion.risk}
                        {suggestion.type === "split_task" ? " · 后续支持" : ""}
                      </p>
                      <p className="mt-2">日期：{suggestion.current_planned_date || "-"} → {suggestion.suggested_planned_date || "-"}</p>
                      <p>时长：{suggestion.current_estimated_duration ?? "-"} → {suggestion.suggested_estimated_duration ?? "-"} 分钟</p>
                      {suggestion.add_tags.length > 0 && <p>追加标签：{suggestion.add_tags.join(" / ")}</p>}
                      <p className="mt-2 text-[var(--muted-foreground)]">{suggestion.reason}</p>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </PreviewBlock>
        <PreviewBlock title="调整后每日负荷">
          <div className="grid gap-2 sm:grid-cols-2">
            {reschedule.daily_load_after.map((day) => (
              <div key={day.date} className="rounded-xl border border-white/10 p-3">
                <p className="font-medium">{day.date}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{day.estimated_minutes} 分钟 · {day.task_count} 项任务</p>
                <p className={day.overload ? "mt-1 text-[var(--neon-amber)]" : "mt-1 text-[var(--neon-blue)]"}>{day.overload ? "过载" : "负荷可接受"}</p>
              </div>
            ))}
          </div>
        </PreviewBlock>
        <PreviewBlock title="风险提醒">
          {reschedule.warnings.length > 0 ? <ul className="list-disc space-y-1 pl-5">{reschedule.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>暂无风险提醒</p>}
        </PreviewBlock>
        <div className="glass-inset grid gap-3 p-3 sm:grid-cols-2">
          <button className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={selectedRescheduleSuggestions.length === 0} onClick={applySelectedRescheduleSuggestions}>应用所选调整</button>
          <button className="glass-inset px-4 py-2 text-sm" type="button" onClick={() => navigator.clipboard.writeText(preview.raw || JSON.stringify(reschedule, null, 2))}>复制 JSON</button>
          <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">默认只勾选 low risk；medium / high risk 默认不勾选。只会修改 planned_date、estimated_duration 或追加 tags，不会写 quadrant。</p>
          {rescheduleApplyResults.length > 0 && (
            <div className="sm:col-span-2 space-y-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                applied {rescheduleApplyResults.filter((item) => item.status === "applied").length} · skipped {rescheduleApplyResults.filter((item) => item.status === "skipped").length} · failed {rescheduleApplyResults.filter((item) => item.status === "failed").length}
              </p>
              {rescheduleApplyResults.map((result, index) => (
                <p key={`${result.title}-${index}`} className={result.status === "applied" ? "text-[var(--neon-blue)]" : result.status === "skipped" ? "text-[var(--neon-amber)]" : "text-[var(--neon-pink)]"}>
                  {result.title}：{result.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  const goal = typeof preview.parsed.goal === "object" && preview.parsed.goal ? preview.parsed.goal : null;
  const chapterTitles = (preview.parsed.chapters ?? []).map((chapter) => chapter.title?.trim()).filter(Boolean) as string[];
  const arrangedChapterTitles = new Set(
    (preview.parsed.daily_plan ?? [])
      .flatMap((day) => day.tasks ?? [])
      .flatMap((task) => [task.title, ...stringList(task.knowledge_points)])
      .filter(Boolean)
      .flatMap((value) => chapterTitles.filter((title) => `${value}`.includes(title))),
  );
  const coverageDates = (preview.parsed.daily_plan ?? []).map((day) => day.date).filter(Boolean) as string[];
  const coverageStart = coverageDates.length ? [...coverageDates].sort()[0] : "-";
  const sortedCoverageDates = [...coverageDates].sort();
  const coverageEnd = coverageDates.length ? sortedCoverageDates[sortedCoverageDates.length - 1] ?? "-" : "-";
  const totalChapters = chapterTitles.length;
  const arrangedCount = arrangedChapterTitles.size;
  const missingCount = Math.max(0, totalChapters - arrangedCount);
  const completeCoverage = totalChapters > 0 && missingCount === 0 && preview.parsed.plan_scope === "full_plan";
  const sourceTag = learningPlanSourceTag(preview.parsed);
  const existingTasks = useAppStore.getState().tasks;
  return (
    <div className="mt-4 space-y-3 text-sm">
      <PreviewBlock title="计划概览">
        <p>{preview.parsed.summary || "暂无概览"}</p>
        {goal ? (
          <div className="mt-2 text-[var(--muted-foreground)]">
            <p>{goal.title || "未命名学习项目"} · {goal.subject || "未设科目"} · {goal.exam_type || "未设考试类型"}</p>
            <p>截止 {goal.deadline || "-"} · 每日 {goal.daily_available_minutes ?? "-"} 分钟 · 基础 {goal.current_level || "-"}</p>
          </div>
        ) : <p className="mt-2 text-[var(--muted-foreground)]">{typeof preview.parsed.goal === "string" ? preview.parsed.goal : "暂无目标"}</p>}
      </PreviewBlock>
      <PreviewBlock title="覆盖检查">
        <div className="grid gap-2 sm:grid-cols-2">
          <p>章节总数：{totalChapters}</p>
          <p>已安排章节数：{arrangedCount}</p>
          <p>未安排章节数：{missingCount}</p>
          <p>覆盖日期范围：{coverageStart} ～ {coverageEnd}</p>
          <p className="sm:col-span-2">是否完整覆盖：{completeCoverage ? "是" : "否"}</p>
        </div>
        {!completeCoverage && <p className="mt-2 text-[var(--neon-amber)]">当前计划未覆盖全部章节，建议继续生成后续计划。</p>}
        {preview.parsed.plan_scope && preview.parsed.plan_scope !== "full_plan" && <p className="mt-2 text-[var(--neon-amber)]">当前只是部分计划，不要误以为已覆盖全部。</p>}
      </PreviewBlock>
      {stringList(preview.parsed.clarification_questions).length > 0 && <PreviewBlock title="待追问信息"><ul className="list-disc space-y-1 pl-5">{stringList(preview.parsed.clarification_questions).map((item) => <li key={item}>{item}</li>)}</ul></PreviewBlock>}
      <PreviewBlock title={`章节和知识点 (${preview.parsed.chapters?.length ?? 0})`}>
        <div className="space-y-2">
          {(preview.parsed.chapters ?? []).map((chapter, index) => (
            <div key={`${chapter.title ?? "chapter"}-${index}`} className="rounded-xl border border-white/10 p-3">
              <p className="font-semibold">{chapter.title || "未命名章节"}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">难度 {chapter.difficulty || "-"} · 优先级 {chapter.priority || "-"} · 预计 {chapter.estimated_minutes ?? "-"} 分钟</p>
              <p className="mt-1">{stringList(chapter.knowledge_points).join(" / ") || "暂无知识点"}</p>
              {chapter.reason && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{chapter.reason}</p>}
            </div>
          ))}
        </div>
      </PreviewBlock>
      <PreviewBlock title={`每日安排 (${preview.parsed.daily_plan?.length ?? 0})`}>
        <div className="space-y-2">
          {(preview.parsed.daily_plan ?? []).map((day, index) => (
            <div key={`${day.date ?? "day"}-${index}`} className="rounded-xl border border-white/10 p-3">
              <p className="font-semibold">{day.date || "-"} · {day.title || "未命名安排"}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">总计 {day.total_minutes ?? "-"} 分钟 {day.note ? `· ${day.note}` : ""}</p>
            </div>
          ))}
        </div>
      </PreviewBlock>
      <PreviewBlock title={`任务 (${tasks.length})`}>
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <label key={`${task.title ?? "task"}-${index}`} className="block rounded-xl border border-white/10 p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedTaskIndexes.includes(index)} onChange={() => setSelectedTaskIndexes((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />
                <div className="min-w-0">
                  <p className="font-semibold">{task.title || "未命名任务"}</p>
                  <p className="mt-1 text-[var(--muted-foreground)]">{task.description || "暂无说明"}</p>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">紧急度 {`${task.urgency ?? "-"}`} · 重要性 {`${task.importance ?? "-"}`} · 预计 {`${task.estimated_duration ?? "-"} 分钟`}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">计划日期 {task.planned_date || "-"} · 截止时间 {task.deadline || "-"}</p>
                  {existingTasks.some((existing) => taskDuplicateMatch(existing, previewTaskDraft(task), sourceTag)) && <p className="mt-2 text-xs text-[var(--neon-amber)]">可能已存在</p>}
                </div>
              </div>
            </label>
          ))}
        </div>
      </PreviewBlock>
      <RecordListBlock title="日程" items={preview.parsed.events} />
      <RecordListBlock title="复习轮次" items={preview.parsed.review_rounds ?? preview.parsed.review_plan} />
      <RecordListBlock title="资料" items={preview.parsed.materials} />
      <RecordListBlock title="自适应规则" items={preview.parsed.adaptive_rules} />
      <RecordListBlock title="LearnKATA 联动" items={preview.parsed.learnkata_links} />
      <PreviewBlock title="风险提醒">{stringList(preview.parsed.warnings).length > 0 ? <ul className="list-disc space-y-1 pl-5">{stringList(preview.parsed.warnings).map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>暂无风险提醒</p>}</PreviewBlock>
      <div className="glass-inset grid gap-3 p-3 sm:grid-cols-2">
        <button className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={selectedTasks.length === 0} onClick={applySelectedTasks}>应用为任务</button>
        <button className="glass-inset px-4 py-2 text-sm" type="button" onClick={() => navigator.clipboard.writeText(preview.raw || JSON.stringify(preview.parsed ?? {}, null, 2))}>复制 JSON</button>
        <button className="glass-inset px-4 py-2 text-sm opacity-60" type="button" disabled>应用为日程</button>
        <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">当前只预览并可应用为任务；尚无独立事件表，因此“应用为日程”继续禁用。quadrant 仍由 Rust 根据 urgency + importance 计算。</p>
        {applyResults.length > 0 && (
          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              created {applyResults.filter((item) => item.status === "success").length} · skipped_duplicate {applyResults.filter((item) => item.status === "skipped_duplicate").length} · failed {applyResults.filter((item) => item.status === "failed").length}
            </p>
            {applyResults.map((result, index) => <p key={`${result.title}-${index}`} className={result.status === "success" ? "text-[var(--neon-blue)]" : result.status === "skipped_duplicate" ? "text-[var(--neon-amber)]" : "text-[var(--neon-pink)]"}>{result.title}：{result.message}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

function toLocalIso(value?: string | null) {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format() : value;
}

function parseInboxCaptureText(text: string) {
  const parsed = parseLearningPlanText(text);
  const candidate = parsed.parsed as unknown as InboxCapturePreview | null;
  return candidate?.intent === "inbox_capture" && Array.isArray(candidate.items) ? candidate : null;
}


function ReminderDock() {
  const { reminders, dismissReminder, snoozeReminder, completeReminder, tasks, selectTask, setView } = useAppStore();
  const triggered = reminders.filter((item) => item.status === "triggered");
  const upcoming = reminders.filter((item) => item.status === "pending");
  const todayKey = dayjs().format("YYYY-MM-DD");
  if (reminders.length === 0) return null;
  return (
    <aside className="reminder-dock glass-card fixed bottom-4 left-24 z-20 w-[min(360px,calc(100vw-32px))] p-3">
      <div className="flex items-center justify-between">
        <span className="section-label">提醒中心</span>
        <span className="text-xs text-[var(--muted-foreground)]">今日 {reminders.filter((item) => item.remind_at.startsWith(todayKey)).length}</span>
      </div>
      <div className="mt-2 space-y-2">
        {[...triggered, ...upcoming.slice(0, 2)].map((reminder) => (
          <div key={reminder.id} className="rounded-xl border border-white/10 p-2 text-sm">
            <button className="w-full text-left font-medium" type="button" onClick={() => {
              const task = tasks.find((item) => item.id === reminder.task_id);
              if (task) { selectTask(task.id); setView("tasks"); }
            }}>{reminder.title}</button>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{dayjs(reminder.remind_at).format("MM-DD HH:mm")} · {reminder.status}</p>
            {reminder.status === "triggered" && (
              <div className="mt-2 flex gap-2">
                <button className="glass-inset px-2 py-1 text-xs" onClick={() => completeReminder(reminder.id)}>完成</button>
                <button className="glass-inset px-2 py-1 text-xs" onClick={() => dismissReminder(reminder.id)}>忽略</button>
                <button className="glass-inset px-2 py-1 text-xs" onClick={() => snoozeReminder(reminder.id)}>10 分钟后</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">已触发 {triggered.length} · 即将到来 {upcoming.length} · 已忽略 {reminders.filter((item) => item.status === "dismissed").length}</p>
    </aside>
  );
}
function TasksView() {
  const { tasks, selectedTaskId, selectTask, updateTask } = useAppStore();
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>("today");
  const [customDate, setCustomDate] = useState(defaultTaskDate);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchDate, setBatchDate] = useState(defaultTaskDate);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const visibleTasks = tasks.filter((task) => isTaskVisibleForDateFilter(task, dateFilter, customDate));
  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));
  const selectedCount = selectedTasks.length;
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const confirmBatch = async (label: string, run: (task: Task) => Promise<void>) => {
    if (selectedCount === 0) return;
    if (!window.confirm(`确认对 ${selectedCount} 个任务执行“${label}”？`)) return;
    for (const task of selectedTasks) {
      await run(task);
    }
    setSelectedIds([]);
  };
  return (
    <section className="glass-card flex h-full min-h-0 gap-5 overflow-hidden p-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="任务列表" subtitle="未完成 / 已完成 / 四象限" />
        <div className="glass-inset mt-3 flex flex-wrap items-center gap-2 p-2 text-sm">
          {[
            ["today", "今天"],
            ["tomorrow", "明天"],
            ["week", "本周"],
            ["all", "全部"],
            ["custom", "自定义"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-lg px-3 py-1.5 [transition:var(--transition-smooth)] ${dateFilter === value ? "btn-glow" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              onClick={() => setDateFilter(value as TaskDateFilter)}
            >
              {label}
            </button>
          ))}
          {dateFilter === "custom" && (
            <input className="field py-1.5" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
          )}
          <button type="button" className="glass-inset ml-auto rounded-xl px-3 py-1.5 text-xs" onClick={() => setTrashDialogOpen(true)}>
            回收站
          </button>
          <button type="button" className="btn-glow rounded-xl px-3 py-1.5 text-xs font-semibold" onClick={() => setCreateDialogOpen(true)}>
            新建任务
          </button>
        </div>
        {createDialogOpen && (
          <TaskCreateDialog
            currentDate={dateFilter === "custom" ? customDate : undefined}
            onClose={() => setCreateDialogOpen(false)}
          />
        )}
        <div className="glass-inset batch-toolbar thin-scrollbar mt-3 flex items-center gap-2 overflow-x-auto p-2 text-sm">
          <span className="shrink-0 px-2 text-xs font-medium text-[var(--muted-foreground)]">已选择 {selectedCount} 项</span>
          <label className="flex shrink-0 items-center gap-2 text-xs">
            <span className="text-[var(--muted-foreground)]">目标日期</span>
            <input className="field py-1.5" type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} />
          </label>
          <button type="button" title={selectedCount === 0 ? "先选择任务" : "批量延期"} className="glass-inset shrink-0 px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-blue)] disabled:opacity-40" disabled={selectedCount === 0} onClick={() => confirmBatch("延期到指定日期", (task) => updateTask({ id: task.id, planned_date: batchDate }))}>批量延期</button>
          <button type="button" title={selectedCount === 0 ? "先选择任务" : "标记待整理"} className="glass-inset shrink-0 px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-amber)] disabled:opacity-40" disabled={selectedCount === 0} onClick={() => confirmBatch("标记为待整理", (task) => updateTask({ id: task.id, tags: tagsWithNeedsReview(task) }))}>标记待整理</button>
          <button type="button" title={selectedCount === 0 ? "先选择任务" : "批量完成"} className="glass-inset shrink-0 px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-emerald-400 disabled:opacity-40" disabled={selectedCount === 0} onClick={() => confirmBatch("批量完成", (task) => updateTask({ id: task.id, status: "done" }))}>批量完成</button>
          <button type="button" title={selectedCount === 0 ? "先选择任务" : "应用"} className="glass-inset shrink-0 px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)] disabled:opacity-40" disabled={selectedCount === 0} onClick={() => confirmBatch("应用", async () => undefined)}>应用</button>
          {selectedCount === 0 ? <span className="shrink-0 text-xs text-[var(--muted-foreground)]">先选择任务</span> : (
            <button type="button" className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setSelectedIds([])}>取消选择</button>
          )}
        </div>
        <div className="quadrant-grid mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden pr-1 lg:grid-cols-2">
          {[1, 2, 3, 4].map((quadrant) => (
            <QuadrantColumn
              key={quadrant}
              quadrant={quadrant}
              tasks={visibleTasks.filter((task) => task.quadrant === quadrant)}
              onSelect={selectTask}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
            />
          ))}
        </div>
      </div>
      <TaskDetail task={selected} />
      {trashDialogOpen && createPortal(
        <TrashDialog onClose={() => setTrashDialogOpen(false)} />,
        document.body,
      )}
    </section>
  );
}

function TaskCreateDialog({ currentDate, onClose }: { currentDate?: string; onClose: () => void }) {
  const createTask = useAppStore((state) => state.createTask);
  const [draft, setDraft] = useState(emptyDraft);
  const [deadlineDate, setDeadlineDate] = useState(currentDate || defaultTaskDate);
  const [plannedDate, setPlannedDate] = useState(currentDate || defaultTaskDate);
  const [taskTime, setTaskTime] = useState(defaultTaskTime);
  const update = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <form
      className="glass-card grid max-h-[88vh] w-full max-w-2xl grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2"
      role="dialog"
      aria-modal="true"
      aria-label="新建任务"
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        await createTask({
          ...draft,
          deadline: deadlineDate ? combineLocalDateTime(deadlineDate, taskTime) : "",
          planned_date: plannedDate,
        });
        setDraft(emptyDraft);
        setDeadlineDate(defaultTaskDate());
        setPlannedDate(defaultTaskDate());
        setTaskTime(defaultTaskTime());
        onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 sm:col-span-2">
        <div>
          <p className="section-label">Task</p>
          <h3 className="mt-1 text-lg font-semibold">新建任务</h3>
          {currentDate && <p className="mt-1 text-xs text-[var(--muted-foreground)]">当前筛选日期：{currentDate}</p>}
        </div>
        <button className="glass-inset px-3 py-1.5 text-xs" type="button" onClick={onClose}>关闭</button>
      </div>
      <input className="field sm:col-span-2" value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="任务标题" autoFocus />
      <textarea className="field min-h-24 sm:col-span-2" value={draft.description} onChange={(e) => update("description", e.target.value)} placeholder="备注" />
      <select className="field" value={draft.priority} onChange={(e) => update("priority", e.target.value)}>
        <option value="high">高优先级</option>
        <option value="medium">中优先级</option>
        <option value="low">低优先级</option>
      </select>
      <select className="field" value={draft.importance} onChange={(e) => update("importance", e.target.value)}>
        <option value="important">重要</option>
        <option value="not_important">不重要</option>
      </select>
      <select className="field" value={draft.urgency} onChange={(e) => update("urgency", e.target.value)}>
        <option value="urgent">紧急</option>
        <option value="not_urgent">不紧急</option>
      </select>
      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        deadline 日期
        <input className="field" type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        deadline 时间
        <input className="field" type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        planned_date
        <input className="field" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
      </label>
      <input className="field" value={draft.tags} onChange={(e) => update("tags", e.target.value)} placeholder="tags，逗号分隔" />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button className="glass-inset px-4 py-2 text-sm" type="button" onClick={onClose}>取消</button>
        <button className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold" type="submit">
          创建
        </button>
      </div>
    </form>
    </div>,
    document.body,
  );
}

function QuadrantColumn({
  quadrant,
  tasks,
  onSelect,
  selectedIds,
  onToggleSelected,
}: {
  quadrant: number;
  tasks: Task[];
  onSelect: (id: string) => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
}) {
  const updateTask = useAppStore((state) => state.updateTask);
  const meta = quadrantMeta[quadrant];
  const containerRef = useCallback((el: HTMLDivElement | null) => registerQuadrantRef(quadrant, el), [quadrant]);
  const allowQuadrantDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  };
  const dropToQuadrant = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const id = getTaskDragData(event);
    if (!id) {
      console.warn("Quadrant drop ignored: missing task id");
      showToast("拖拽失败：没有读取到任务 ID。");
      return;
    }
    try {
      await updateTask({ id, urgency: meta.urgency, importance: meta.importance });
      showToast(`已移动到 Q${quadrant}`);
    } catch (error) {
      console.warn("Quadrant drop failed", error);
      showToast("拖拽更新失败，请再试一次。");
    }
  };
  return (
    <div ref={containerRef} data-quadrant-drop={`Q${quadrant}`} className="quadrant-card glass-card flex min-h-0 flex-col p-3 [transition:var(--transition-smooth)]" onDragEnter={allowQuadrantDrop} onDragOver={allowQuadrantDrop} onDrop={dropToQuadrant}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--muted-foreground)]">Eisenhower Matrix</p>
          <h3 className="mt-1 text-xl font-semibold leading-tight" style={{ color: quadrantColors[quadrant] }}>
            {meta.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{meta.description}</p>
        </div>
        <span className="glass-inset shrink-0 px-2 py-0.5 text-xs opacity-80">{tasks.length} 项</span>
      </div>
      <div className="quadrant-task-list thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" onDragEnter={allowQuadrantDrop} onDragOver={allowQuadrantDrop} onDrop={dropToQuadrant}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={selectedIds.includes(task.id)}
            onToggleSelected={() => onToggleSelected(task.id)}
            onSelect={() => onSelect(task.id)}
          />
        ))}
        {tasks.length === 0 && <p className="glass-inset border-dashed p-4 text-sm opacity-60">暂无任务</p>}
      </div>
    </div>
  );
}

function TaskRow({ task, selected, onToggleSelected, onSelect }: { task: Task; selected: boolean; onToggleSelected: () => void; onSelect: () => void }) {
  const { updateTask, deleteTask, startFocus } = useAppStore();
  const done = task.status === "done";
  const overdue = taskOverdueLabel(task);
  const tags = parseTags(task);
  const moveToQuadrant = async (targetQuadrant: number) => {
    const target = quadrantMeta[targetQuadrant];
    try {
      await updateTask({ id: task.id, urgency: target.urgency, importance: target.importance });
      showToast(`已移动到 Q${targetQuadrant}`);
    } catch (error) {
      console.warn("Quadrant fallback move failed", error);
      showToast("移动失败，请再试一次。");
    }
  };

  // Pointer Events drag handler for the drag handle
  const onHandlePointerDown = useCallback((event: React.PointerEvent) => {
    // Only primary button
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    // Capture pointer for reliable tracking even outside element
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    // Style the source card
    const card = event.currentTarget.closest(".glass-inset") as HTMLElement | null;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Only start dragging after 5px threshold
      if (!dragStarted && (dx * dx + dy * dy) < 25) return;

      if (!dragStarted) {
        dragStarted = true;
        _ptrDragTaskId = task.id;
        // Create ghost
        const ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.textContent = task.title;
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        document.body.appendChild(ghost);
        _ptrGhost = ghost;
        if (card) card.style.opacity = "0.5";
      }

      if (_ptrGhost) {
        _ptrGhost.style.left = `${e.clientX}px`;
        _ptrGhost.style.top = `${e.clientY}px`;
      }
      const targetQ = findQuadrantAtPoint(e.clientX, e.clientY);
      if (targetQ !== _ptrHighlightedQuadrant) {
        clearPtrHighlight();
        if (targetQ !== null) {
          const el = _ptrQuadrantRefs.get(targetQ);
          el?.classList.add("quadrant-drop-highlight");
          _ptrHighlightedQuadrant = targetQ;
        }
      }
    };

    const onUp = async (e: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (card) card.style.opacity = "";
      clearPtrHighlight();
      removePtrGhost();
      const targetQ = findQuadrantAtPoint(e.clientX, e.clientY);
      const dragId = _ptrDragTaskId;
      _ptrDragTaskId = null;
      if (dragStarted && targetQ !== null && dragId) {
        const target = quadrantMeta[targetQ];
        try {
          await useAppStore.getState().updateTask({ id: dragId, urgency: target.urgency, importance: target.importance });
          showToast(`已移动到 Q${targetQ}`);
        } catch (error) {
          console.warn("Pointer drag update failed", error);
          showToast("拖拽更新失败，请再试一次。");
        }
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [task.id, task.title]);

  return (
    <div
      className="glass-inset group cursor-default p-2.5 text-sm [transition:var(--transition-smooth)] hover:-translate-y-0.5 hover:border-[var(--ring)]"
      style={{ userSelect: "none" as const }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--neon-violet)]"
          draggable={false}
          checked={selected}
          onChange={(event) => {
            event.stopPropagation();
            onToggleSelected();
          }}
          onClick={(event) => event.stopPropagation()}
          aria-label="选择任务"
        />
        <button
          className="icon-btn"
          draggable={false}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            updateTask({ id: task.id, status: done ? "todo" : "done" });
          }}
          title="完成"
        >
          <Check size={16} />
        </button>
        <strong className={done ? "task-done min-w-0 flex-1" : "min-w-0 flex-1"}>{task.title}</strong>
        <span
          className="pointer-drag-handle glass-inset inline-flex h-7 w-7 shrink-0 cursor-grab select-none items-center justify-center rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--neon-blue)]"
          onPointerDown={onHandlePointerDown}
          title="拖拽移动象限"
        >
          ::
        </span>
        <span className="glass-inset inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
          <PriorityDot quadrant={task.quadrant} />
          {priorityLabel(task.priority)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs opacity-70">
        <span>{task.deadline ? dayjs(task.deadline).format("MM-DD HH:mm") : "无截止时间"}</span>
        <div className="flex gap-1">
          <button
            className="icon-btn"
            title="开始专注"
            onClick={(event) => {
              event.stopPropagation();
              startFocus(task);
            }}
          >
            <CirclePlay size={15} />
          </button>
          <button
            className="icon-btn"
            title="删除"
            onClick={(event) => {
              event.stopPropagation();
              deleteTask(task.id);
            }}
          >
            <Trash2 size={15} />
          </button>
          <select
            className="quadrant-move-select max-w-[120px] rounded-lg px-2 py-1 text-xs"
            value=""
            draggable={false}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              const target = Number(event.target.value);
              if (target) void moveToQuadrant(target);
              event.currentTarget.value = "";
            }}
            title="移动到"
            aria-label="移动到象限"
          >
            <option value="">移动到</option>
            <option value="1">Q1 重要且紧急</option>
            <option value="2">Q2 重要不紧急</option>
            <option value="3">Q3 紧急不重要</option>
            <option value="4">Q4 不重要不紧急</option>
          </select>
        </div>
      </div>
      {(overdue || isNeedsReviewTask(task) || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {overdue && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">{overdue}</span>}
          {isNeedsReviewTask(task) && <span className="rounded-full bg-[var(--neon-amber)]/15 px-2 py-0.5 text-[var(--neon-amber)]">待整理</span>}
          {tags.filter((tag) => !needsReviewTags.includes(tag)).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-[var(--muted-foreground)]">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: Task | null }) {
  const allRecords = useAppStore((state) => state.records);
  const updateTask = useAppStore((state) => state.updateTask);
  const records = useMemo(() => allRecords.filter((record) => record.task_id === task?.id), [allRecords, task?.id]);
  const [editDate, setEditDate] = useState(defaultTaskDate);
  const [editTime, setEditTime] = useState(defaultTaskTime);

  useEffect(() => {
    if (!task) return;
    const deadline = splitLocalDateTime(task.deadline);
    setEditDate(task.planned_date || deadline.date);
    setEditTime(deadline.time);
  }, [task?.id, task?.deadline, task?.planned_date]);

  if (!task) return <aside className="glass-card w-[360px] border-dashed p-5 opacity-70">还没有任务，对 AI 说一句话试试看。</aside>;
  return (
    <aside className="glass-card hidden w-[380px] flex-col overflow-auto p-5 xl:flex">
      <div className="mb-4">
        <p className="section-label">任务详情</p>
        <h2 className="neon-text text-xl font-semibold">{task.title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info label="优先级" value={priorityLabel(task.priority)} />
        <Info label="象限" value={`Q${task.quadrant} ${quadrantLabels[task.quadrant]}`} />
        <Info label="截止" value={task.deadline ? dayjs(task.deadline).format("YYYY-MM-DD HH:mm") : "未设置"} />
        <Info label="计划日" value={task.planned_date || "未设置"} />
      </div>
      <div className="glass-inset mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 p-3">
        <input className="field" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
        <input className="field" type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
        <button
          type="button"
          className="btn-glow rounded-xl px-3 py-2 text-sm font-semibold"
          onClick={() =>
            updateTask({
              id: task.id,
              planned_date: editDate,
              deadline: combineLocalDateTime(editDate, editTime),
            })
          }
        >
          更新
        </button>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-semibold">备注</h3>
        <div className="markdown glass-inset p-3 text-sm">
          <ReactMarkdown>{task.description || "暂无备注"}</ReactMarkdown>
        </div>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-semibold">专注记录</h3>
        <p className="mb-2 text-sm opacity-70">累计 {formatMinutes(task.actual_total_duration)}</p>
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="glass-inset p-3 text-sm">
              <div className="font-medium">{modeLabel(record.mode)}</div>
              <div className="opacity-70">{dayjs(record.started_at).format("MM-DD HH:mm")} / {formatMinutes(record.duration)}</div>
            </div>
          ))}
          {records.length === 0 && <div className="glass-inset border-dashed p-3 text-sm opacity-60">暂无专注记录。</div>}
        </div>
      </div>
    </aside>
  );
}

function TimerView() {
  const { tasks, records, timer, timerTopic, timerTaskId, setTimerContext, startTimer, pauseTimer, resetTimer, stopTimer } = useAppStore();
  const [mode, setMode] = useState<TimerMode>("positive");
  const [pomodoroMinutes, setPomodoroMinutes] = useState("25");
  const [countdownHours, setCountdownHours] = useState("0");
  const [countdownMinutes, setCountdownMinutes] = useState("30");
  const [lastCountdownSeconds, setLastCountdownSeconds] = useState(30 * 60);

  const [dateFilter, setDateFilter] = useState("today");
  const [modeFilter, setModeFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");

  const autoStoppedRef = useRef(false);
  const elapsed = timer.elapsed_seconds;
  const selectedPomodoroMinutes = Math.max(1, Number(pomodoroMinutes) || 25);
  const countdownSeconds = Math.max(60, (Math.max(0, Number(countdownHours) || 0) * 60 + Math.max(0, Number(countdownMinutes) || 0)) * 60);
  const selectedSeconds = mode === "pomodoro" ? selectedPomodoroMinutes * 60 : mode === "countdown" ? countdownSeconds : 0;
  const minutes = mode === "countdown" ? String(Math.round(countdownSeconds / 60)) : pomodoroMinutes;
  const setMinutes = mode === "countdown" ? (value: string) => setCountdownMinutes(value) : setPomodoroMinutes;
  const activeMode = timer.active && timer.mode ? timer.mode : mode;
  const target = timer.target_seconds ?? (activeMode === "positive" ? Math.max(3600, elapsed || 3600) : selectedSeconds);
  const progress =
    activeMode === "positive"
      ? Math.min(100, (elapsed / target) * 100)
      : timer.active
        ? Math.min(100, ((target - (timer.remaining_seconds ?? target)) / target) * 100)
        : 0;
  const displaySeconds = timer.active
    ? activeMode === "positive" || timer.remaining_seconds == null
      ? elapsed
      : timer.remaining_seconds
    : mode === "positive"
      ? 0
      : mode === "pomodoro"
        ? selectedPomodoroMinutes * 60
        : lastCountdownSeconds;

  const incompleteTasks = tasks.filter(t => t.status !== "done" && t.status !== "archived");
  const recommendedTasks = getRecommendedTasks(tasks, records, timerTopic, timerTaskId);

  const filteredRecords = records.filter(r => {
    let dateMatch = true;
    if (dateFilter === "today") dateMatch = dayjs(r.started_at).isSame(dayjs(), "day");
    else if (dateFilter === "yesterday") dateMatch = dayjs(r.started_at).isSame(dayjs().subtract(1, "day"), "day");
    else if (dateFilter === "week") dateMatch = dayjs(r.started_at).isAfter(dayjs().subtract(7, "day"));
    // Custom date logic could be extended if needed, treating "custom" as "all" for now if not implemented.
    
    let modeMatch = true;
    if (modeFilter !== "all") modeMatch = r.mode === modeFilter;
    
    let taskMatch = true;
    if (taskFilter === "linked") taskMatch = !!r.task_id;
    else if (taskFilter === "unlinked") taskMatch = !r.task_id;
    else if (taskFilter !== "all") taskMatch = r.task_id === taskFilter;

    return dateMatch && modeMatch && taskMatch;
  }).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const summary = useMemo(() => {
    const totalDuration = filteredRecords.reduce((acc, curr) => acc + curr.duration, 0);
    const count = filteredRecords.length;
    const avgDuration = count > 0 ? totalDuration / count : 0;
    const pomodoroCount = filteredRecords.filter(r => r.mode === "pomodoro").length;
    const linkedCount = filteredRecords.filter(r => !!r.task_id).length;
    const unlinkedCount = count - linkedCount;
    return { totalDuration, count, avgDuration, pomodoroCount, linkedCount, unlinkedCount };
  }, [filteredRecords]);

  useEffect(() => {
    if (!timer.active || timer.paused || timer.mode === "positive" || timer.remaining_seconds == null || timer.remaining_seconds > 0) {
      if (!timer.active) autoStoppedRef.current = false;
      return;
    }
    if (autoStoppedRef.current) return;
    autoStoppedRef.current = true;
    stopTimer(timer.task_id ?? null);
  }, [timer.active, timer.paused, timer.mode, timer.remaining_seconds, timer.task_id, stopTimer]);

  // Sync local mode with actual timer.mode when timer starts (e.g., from startFocus)
  useEffect(() => {
    if (timer.active && timer.mode && timer.mode !== mode) {
      setMode(timer.mode);
    }
  }, [timer.active, timer.mode]);

  const switchMode = (nextMode: TimerMode) => {
    if (timer.active) {
      showToast("当前正在计时，请先暂停、结束或重置后再切换模式。");
      return;
    }
    setMode(nextMode);
    if (nextMode === "pomodoro" && !pomodoroMinutes) setPomodoroMinutes("25");
    if (nextMode === "countdown") {
      const hours = Math.floor(lastCountdownSeconds / 3600);
      const minutes = Math.round((lastCountdownSeconds % 3600) / 60);
      setCountdownHours(String(hours));
      setCountdownMinutes(String(minutes));
    }
    showToast(`已切换为${modeLabel(nextMode)}`);
  };

  const startCurrentTimer = () => {
    const target_seconds = mode === "positive" ? null : mode === "pomodoro" ? selectedPomodoroMinutes * 60 : countdownSeconds;
    if (mode === "countdown") setLastCountdownSeconds(countdownSeconds);
    startTimer({ topic: timerTopic, mode, target_seconds, task_id: timerTaskId || null });
  };

  return (
    <section className="timer-page-shell glass-card animate-fade-in flex flex-col p-5 min-h-full pb-12">
      <Header title="专注计时" subtitle="Rust 后端 Instant 管理起止时间，前端消费后端秒级状态" />
      <div className="flex-1 w-full flex flex-col items-center mt-6">
        <div className="timer-hero-section flex w-full max-w-4xl flex-col items-center gap-6">
          <div className="flex gap-2">
            {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((item) => (
              <button key={item} className={`rounded-xl px-4 py-2 text-sm [transition:var(--transition-smooth)] ${mode === item ? "btn-glow" : "glass-inset text-[var(--muted-foreground)]"}`} onClick={() => switchMode(item)}>
                {modeLabel(item)}
              </button>
            ))}
          </div>
          <TimerOrb seconds={displaySeconds} progress={progress} paused={timer.paused} mode={activeMode} />
          <p className="max-w-xl text-center text-sm text-[var(--muted-foreground)]">{modeDescription(mode)}</p>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
            <select 
              className="field" 
              value={timerTaskId || ""} 
              onChange={(e) => {
                const id = e.target.value;
                if (id) {
                  const task = tasks.find(t => t.id === id);
                  if (task) setTimerContext(task.title, id);
                } else {
                  setTimerContext("自由专注", null);
                }
              }}
            >
              <option value="">仅记录时间 (无关联任务)</option>
              {incompleteTasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <input className="field" value={timerTopic} onChange={(e) => setTimerContext(e.target.value, timerTaskId)} placeholder="当前专注主题" />
            <input className="field" value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min="1" disabled={mode === "positive"} title={mode === "positive" ? "正计时不需要目标时长" : "目标分钟数"} />
          </div>
          {mode === "pomodoro" && (
            <div className="flex flex-wrap justify-center gap-2">
              {[15, 25, 30, 45, 60].map((preset) => (
                <button key={preset} type="button" className={`glass-inset px-3 py-2 text-sm ${Number(pomodoroMinutes) === preset ? "btn-glow" : ""}`} onClick={() => setPomodoroMinutes(String(preset))}>
                  {preset}m
                </button>
              ))}
            </div>
          )}
          {mode === "countdown" && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <input className="field w-24" value={countdownHours} onChange={(e) => setCountdownHours(e.target.value)} type="number" min="0" title="小时" />
              <span className="text-sm text-[var(--muted-foreground)]">小时</span>
              <input className="field w-24" value={countdownMinutes} onChange={(e) => setCountdownMinutes(e.target.value)} type="number" min="0" max="59" title="分钟" />
              <span className="text-sm text-[var(--muted-foreground)]">分钟</span>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {!timer.active && (
              <button className="glass-inset flex items-center gap-2 px-4 py-2 text-sm" onClick={resetTimer}>
                <RotateCcw size={18} /> 重置
              </button>
            )}
            {!timer.active ? (
              <button className="btn-glow flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" onClick={startCurrentTimer}>
                <Play size={18} /> 开始
              </button>
            ) : (
              <>
                <button className="glass-inset flex items-center gap-2 px-4 py-2 text-sm" onClick={pauseTimer}>
                  <Pause size={18} /> {timer.paused ? "继续" : "暂停"}
                </button>
                <button className="glass-inset flex items-center gap-2 px-4 py-2 text-sm" onClick={resetTimer}>
                  <RotateCcw size={18} /> 重置
                </button>
                <button className="btn-glow flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => stopTimer(timer.task_id ?? null)}>
                  <Square size={18} /> 结束
                </button>
              </>
            )}
          </div>

          {!timer.active && (
            <div className="w-full max-w-2xl mt-4">
              <p className="text-sm font-semibold mb-2">推荐关联任务：</p>
              {recommendedTasks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recommendedTasks.map(t => (
                    <button 
                      key={t.id} 
                      type="button" 
                      title={t.recommendReason}
                      className={`glass-inset px-3 py-1.5 text-xs rounded-lg hover:text-[var(--neon-violet)] [transition:var(--transition-smooth)] flex items-center gap-2 ${timerTaskId === t.id ? 'ring-1 ring-[var(--neon-violet)] text-[var(--neon-violet)]' : ''}`} 
                      onClick={() => setTimerContext(t.title, t.id)}
                    >
                      <span className="max-w-[120px] truncate">{t.title}</span>
                      {t.recommendReason && (
                        <span className="bg-[var(--glass-card-border)] px-1.5 py-0.5 rounded text-[10px] text-[var(--muted-foreground)]">
                          {t.recommendReason}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">暂无推荐任务，可以手动选择或仅记录时间。</p>
              )}
            </div>
          )}
        </div>

        <section className="timer-history-section w-full max-w-4xl mt-12 md:mt-16">
          <div className="glass-card overflow-hidden flex flex-col p-6 rounded-2xl border border-[var(--glass-card-border)] bg-[var(--glass-card-bg)] shadow-[var(--glass-card-shadow)] hover:shadow-[var(--glass-card-shadow-hover)] [transition:var(--transition-smooth)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Trophy size={20} className="text-[var(--neon-violet)]" /> 历史专注记录</h3>
                <div className="flex flex-wrap gap-2">
                  <select className="field !py-1.5 !text-sm" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                    <option value="all">全部时间</option>
                    <option value="today">今天</option>
                    <option value="yesterday">昨天</option>
                    <option value="week">本周</option>
                  </select>
                  <select className="field !py-1.5 !text-sm" value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
                    <option value="all">全部模式</option>
                    <option value="positive">正计时</option>
                    <option value="pomodoro">番茄钟</option>
                    <option value="countdown">倒计时</option>
                  </select>
                  <select className="field !py-1.5 !text-sm max-w-[120px]" value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
                    <option value="all">全部任务</option>
                    <option value="linked">已关联任务</option>
                    <option value="unlinked">未关联</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6 bg-[var(--background)]/30 p-3 rounded-xl border border-[var(--border)]">
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">总计专注</span><span className="text-sm font-semibold">{formatMinutes(summary.totalDuration)}</span></div>
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">记录总数</span><span className="text-sm font-semibold">{summary.count} 次</span></div>
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">平均时长</span><span className="text-sm font-semibold">{formatMinutes(Math.round(summary.avgDuration))}</span></div>
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">番茄钟</span><span className="text-sm font-semibold">{summary.pomodoroCount} 次</span></div>
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">已关联</span><span className="text-sm font-semibold text-[var(--neon-mint)]">{summary.linkedCount} 次</span></div>
                <div className="flex flex-col"><span className="text-xs text-[var(--muted-foreground)]">未关联</span><span className="text-sm font-semibold text-orange-400/80">{summary.unlinkedCount} 次</span></div>
              </div>
              
              {filteredRecords.length === 0 ? (
                <div className="flex-1 grid place-items-center py-12 px-4 rounded-xl border border-dashed border-[var(--border)]">
                  <p className="text-sm text-[var(--muted-foreground)]">暂无匹配的记录</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredRecords.map(record => {
                    const task = tasks.find(t => t.id === record.task_id);
                    return (
                      <div key={record.id} className="glass-inset hover:-translate-y-0.5 [transition:var(--transition-smooth)] flex flex-col p-4 rounded-xl">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="font-semibold text-sm line-clamp-1 flex-1">{task?.title || record.task_topic || record.note || "自由专注"}</span>
                          <span className="text-xs text-[var(--neon-violet)] font-mono shrink-0 px-2 py-1 rounded-md bg-[var(--neon-violet)]/10">{formatMinutes(record.duration)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                          <span className="flex items-center gap-1"><Clock3 size={12} /> {dayjs(record.started_at).format("MM-DD HH:mm")}</span>
                          <span className="flex items-center gap-1"><CirclePlay size={12} /> {modeLabel(record.mode)}</span>
                          {task && <span className="flex items-center gap-1 text-[var(--neon-mint)]"><ListTodo size={12} /> 已关联任务</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
    </section>
  );
}

function LinkRecordPanel() {
  const { tasks, pendingRecord, confirmRecordLink } = useAppStore();
  const [taskId, setTaskId] = useState(pendingRecord?.task_id ?? "");
  const [newTitle, setNewTitle] = useState("");
  const createTask = useAppStore((state) => state.createTask);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 backdrop-blur-sm">
      <div className="glass-card mx-auto mb-0 w-full max-w-3xl rounded-t-2xl p-6">
        <h2 className="text-xl font-semibold">这段时间做了什么？</h2>
        <p className="mt-1 text-sm opacity-70">本次记录：{pendingRecord ? formatMinutes(pendingRecord.duration) : "0m"}</p>
        <div className="mt-4 grid gap-3">
          <select className="field" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">仅记录时间，不关联任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>{task.title}</option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="field" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="或创建新任务后关联" />
            <button className="glass-inset px-4 py-2 text-sm" onClick={async () => { if (!newTitle.trim()) return; await createTask({ ...emptyDraft, title: newTitle }); setNewTitle(""); }}>
              新建
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button className="glass-inset px-4 py-2 text-sm" onClick={() => confirmRecordLink(null)}>仅记录</button>
            <button className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => confirmRecordLink(taskId || null)}>确认关联</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const chartTooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--glass-card-border-hover)",
  borderRadius: "14px",
  color: "var(--popover-foreground)",
  boxShadow: "var(--shadow-elevated)",
} as const;

function ChartCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="glass-card chart-card flex min-h-[288px] flex-col overflow-hidden p-4">
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
      </div>
      <div className="chart-body min-h-0 flex-1">{children}</div>
      {footer && <div className="mt-3 shrink-0 text-xs leading-5 text-[var(--muted-foreground)]">{footer}</div>}
    </section>
  );
}

function ChartLegend({ items }: { items: Array<{ label: string; value: number | string; color: string }> }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <div key={item.label} className="chart-legend-item">
          <span className="chart-legend-dot" style={{ background: item.color, boxShadow: `0 0 16px ${item.color}` }} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="font-mono tabular-nums text-[var(--foreground)]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DonutCenter({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="text-center">
        <div className="font-mono text-3xl font-semibold tabular-nums text-[var(--foreground)]">{value}</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</div>
      </div>
    </div>
  );
}

function StatsView() {
  const { stats, tasks, records, timer } = useAppStore();
  const today = dayjs().format("YYYY-MM-DD");
  const recentDays = useMemo(() => Array.from({ length: 7 }, (_, index) => dayjs().subtract(6 - index, "day")), []);
  const todayTasks = tasks.filter((task) => task.status !== "archived" && (!task.planned_date || task.planned_date === today));
  const completedToday = todayTasks.filter((task) => task.status === "done").length;
  const openToday = todayTasks.filter((task) => task.status !== "done").length;
  const todayRecords = records.filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === today);
  const liveMinutes = timer.active ? timer.elapsed_seconds / 60 : 0;
  const todayMinutes = todayRecords.reduce((sum, record) => sum + record.duration, 0) + liveMinutes;
  const pomodoroCount = todayRecords.filter((record) => record.mode === "pomodoro").length + (timer.active && timer.mode === "pomodoro" ? 1 : 0);
  const trend = recentDays.map((day) => {
    const key = day.format("YYYY-MM-DD");
    return {
      day: day.format("MM-DD"),
      minutes: Math.round(records.filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === key).reduce((sum, record) => sum + record.duration, 0)),
      completed: tasks.filter((task) => task.status === "done" && dayjs(task.updated_at).format("YYYY-MM-DD") === key).length,
    };
  });
  const quadrantData = [1, 2, 3, 4].map((quadrant) => ({
    quadrant,
    label: `Q${quadrant}`,
    count: tasks.filter((task) => task.status !== "archived" && task.quadrant === quadrant).length,
  }));
  const statusData = [
    { name: "已完成", value: tasks.filter((task) => task.status === "done").length },
    { name: "未完成", value: tasks.filter((task) => task.status !== "done" && task.status !== "archived").length },
  ];
  const activeDays = new Set(records.map((record) => dayjs(record.started_at).format("YYYY-MM-DD")));
  let streak = 0;
  for (let index = 0; index < 365; index++) {
    if (!activeDays.has(dayjs().subtract(index, "day").format("YYYY-MM-DD"))) break;
    streak += 1;
  }
  const completionRate = todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0;
  const averageFocus = records.length ? records.reduce((sum, record) => sum + record.duration, 0) / records.length : 0;
  const quadrantTotal = quadrantData.reduce((sum, item) => sum + item.count, 0);
  const statusTotal = statusData.reduce((sum, item) => sum + item.value, 0);
  const quadrantLegend = quadrantData.map((item) => ({
    label: `${item.label} ${quadrantLabels[item.quadrant]}`,
    value: item.count,
    color: quadrantColors[item.quadrant],
  }));
  const statusLegend = [
    { label: statusData[0].name, value: statusData[0].value, color: "var(--neon-blue)" },
    { label: statusData[1].name, value: statusData[1].value, color: "var(--neon-pink)" },
  ];
  return (
    <section className="glass-card animate-rise flex h-full min-h-0 flex-col p-5">
      <Header title="统计" subtitle="今日概览、7 天趋势、任务分布和效率指标" />
      <div className="thin-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-auto pr-1 xl:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="今日总任务" value={todayTasks.length} />
          <StatCard label="今日完成" value={completedToday} />
          <StatCard label="今日未完成" value={openToday} />
          <StatCard label="今日专注" value={formatMinutes(todayMinutes)} />
          <StatCard label="今日番茄" value={pomodoroCount} />
          <StatCard label="达成率" value={`${completionRate}%`} />
          <div className="glass-card chart-card col-span-2 flex h-72 flex-col p-5 md:col-span-3">
            <div className="mb-2 shrink-0">
              <h3 className="text-sm font-semibold">最近 7 天专注时长</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">来自 timer_records，包含当前正在运行的计时。</p>
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: "var(--ring)", strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="minutes" name="分钟" stroke="var(--neon-blue)" fill="oklch(0.72 0.2 240 / 0.22)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-card chart-card col-span-2 flex h-72 flex-col p-5 md:col-span-3">
            <div className="mb-2 shrink-0">
              <h3 className="text-sm font-semibold">最近 7 天完成任务数</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">按任务完成更新时间统计，不用示例数据填充。</p>
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "oklch(0.7 0.24 295 / 0.08)" }} />
                  <Bar dataKey="completed" name="完成数" fill="var(--neon-violet)" radius={[6, 6, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className="glass-card chart-card flex min-h-[220px] flex-col p-5">
            <div className="mb-3 shrink-0">
              <h3 className="text-sm font-semibold">四象限任务分布</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">由任务的 urgency / importance 计算结果汇总。</p>
            </div>
            <div className="flex min-h-0 flex-1 items-center gap-5">
              <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={quadrantData} dataKey="count" nameKey="label" innerRadius="56%" outerRadius="84%" paddingAngle={4} cornerRadius={6} stroke="oklch(1 0 0 / 0.18)" strokeWidth={1}>
                      {quadrantData.map((entry) => <Cell key={entry.quadrant} fill={quadrantColors[entry.quadrant]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <div className="font-mono text-[1.4rem] font-semibold leading-none tabular-nums text-[var(--foreground)]">{quadrantTotal}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[var(--muted-foreground)]">tasks</div>
                  </div>
                </div>
              </div>
              <div className="stats-legend flex min-w-0 flex-1 flex-col">
                {quadrantLegend.map((item) => (
                  <div key={item.label} className="stats-legend-row">
                    <span className="stats-legend-dot" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                    <span className="stats-legend-label">{item.label}</span>
                    <span className="stats-legend-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="glass-card chart-card flex min-h-[220px] flex-col p-5">
            <div className="mb-3 shrink-0">
              <h3 className="text-sm font-semibold">完成 / 未完成分布</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">展示当前真实任务状态，归档任务不计入未完成。</p>
            </div>
            <div className="flex min-h-0 flex-1 items-center gap-5">
              <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="doneGradient" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--neon-blue)" />
                        <stop offset="100%" stopColor="var(--neon-violet)" />
                      </linearGradient>
                      <linearGradient id="openGradient" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--neon-pink)" />
                        <stop offset="100%" stopColor="var(--neon-violet)" />
                      </linearGradient>
                    </defs>
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="84%" paddingAngle={5} cornerRadius={7} stroke="oklch(1 0 0 / 0.18)" strokeWidth={1}>
                      <Cell fill="url(#doneGradient)" />
                      <Cell fill="url(#openGradient)" />
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <div className="font-mono text-[1.4rem] font-semibold leading-none tabular-nums text-[var(--foreground)]">{statusTotal}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[var(--muted-foreground)]">tasks</div>
                  </div>
                </div>
              </div>
              <div className="stats-legend flex min-w-0 flex-1 flex-col">
                {statusLegend.map((item) => (
                  <div key={item.label} className="stats-legend-row">
                    <span className="stats-legend-dot" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                    <span className="stats-legend-label">{item.label}</span>
                    <span className="stats-legend-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="连续专注" value={`${streak} 天`} />
            <StatCard label="平均单次" value={formatMinutes(averageFocus)} />
            <StatCard label="本周完成率" value={`${stats?.weekly_completion_rate ?? 0}%`} />
          </div>
        </div>
      </div>
    </section>
  );
}

type ScheduleSuggestionType = "move_task" | "split_task" | "estimate_duration" | "keep" | "mark_needs_review";

interface ScheduleSuggestionItem {
  type: ScheduleSuggestionType;
  task_id: string;
  title: string;
  from_date: string | null;
  to_date: string | null;
  estimated_duration?: number | null;
  suggested_time_block: {
    start: string | null;
    end: string | null;
  };
  reason: string;
  risk: string;
  confidence: number;
}

interface ScheduleSuggestionResult {
  intent: "schedule_suggestion";
  action: "preview_schedule";
  summary: string;
  overload_days: Array<{
    date: string;
    load_minutes: number;
    level: "overloaded" | "full" | "normal" | "light" | "idle";
    reason: string;
  }>;
  suggestions: ScheduleSuggestionItem[];
  needs_user_confirmation: true;
}

interface SchedulePreviewState {
  loading: boolean;
  result: ScheduleSuggestionResult | null;
  raw: string | null;
  error: string | null;
  source: "ai" | "mock" | null;
}

function extractJsonCandidate(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutFence = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim()
    : trimmed;
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.search(/[\[{]/);
    if (start < 0) throw new Error("AI response did not contain JSON");
    return JSON.parse(withoutFence.slice(start));
  }
}

function validateScheduleSuggestion(value: unknown): ScheduleSuggestionResult {
  const data = typeof value === "string" ? extractJsonCandidate(value) : value;
  if (!data || typeof data !== "object") throw new Error("Schedule suggestion must be a JSON object");
  const record = data as Record<string, unknown>;
  if (record.intent !== "schedule_suggestion") throw new Error("intent must be schedule_suggestion");
  if (record.action !== "preview_schedule") throw new Error("action must be preview_schedule");
  if (record.needs_user_confirmation !== true) throw new Error("needs_user_confirmation must be true");
  if (typeof record.summary !== "string") throw new Error("summary must be a string");
  if (!Array.isArray(record.overload_days)) throw new Error("overload_days must be an array");
  if (!Array.isArray(record.suggestions)) throw new Error("suggestions must be an array");

  const overload_days: ScheduleSuggestionResult["overload_days"] = record.overload_days.map((item) => {
    const day = item as Record<string, unknown>;
    if (typeof day.date !== "string") throw new Error("overload_days[].date must be a string");
    if (typeof day.load_minutes !== "number") throw new Error("overload_days[].load_minutes must be a number");
    if (typeof day.reason !== "string") throw new Error("overload_days[].reason must be a string");
    const level = day.level as ScheduleSuggestionResult["overload_days"][number]["level"];
    if (level !== "overloaded" && level !== "full" && level !== "normal" && level !== "light" && level !== "idle") {
      throw new Error("overload_days[].level is invalid");
    }
    return {
      date: day.date,
      load_minutes: day.load_minutes,
      level,
      reason: day.reason,
    };
  });

  const allowedTypes = new Set<ScheduleSuggestionType>([
    "move_task",
    "split_task",
    "estimate_duration",
    "keep",
    "mark_needs_review",
  ]);
  const suggestions = record.suggestions.map((item) => {
    const suggestion = item as Record<string, unknown>;
    if (!allowedTypes.has(suggestion.type as ScheduleSuggestionType)) throw new Error("suggestions[].type is invalid");
    if (typeof suggestion.task_id !== "string") throw new Error("suggestions[].task_id must be a string");
    if (typeof suggestion.title !== "string") throw new Error("suggestions[].title must be a string");
    if (suggestion.from_date !== null && typeof suggestion.from_date !== "string") throw new Error("suggestions[].from_date must be string or null");
    if (suggestion.to_date !== null && typeof suggestion.to_date !== "string") throw new Error("suggestions[].to_date must be string or null");
    const block = suggestion.suggested_time_block as Record<string, unknown> | null | undefined;
    if (!block || typeof block !== "object") throw new Error("suggestions[].suggested_time_block must be an object");
    if (block.start !== null && typeof block.start !== "string") throw new Error("suggestions[].suggested_time_block.start must be string or null");
    if (block.end !== null && typeof block.end !== "string") throw new Error("suggestions[].suggested_time_block.end must be string or null");
    if (typeof suggestion.reason !== "string") throw new Error("suggestions[].reason must be a string");
    if (typeof suggestion.risk !== "string") throw new Error("suggestions[].risk must be a string");
    if (typeof suggestion.confidence !== "number") throw new Error("suggestions[].confidence must be a number");
    return {
      type: suggestion.type as ScheduleSuggestionType,
      task_id: suggestion.task_id,
      title: suggestion.title,
      from_date: suggestion.from_date as string | null,
      to_date: suggestion.to_date as string | null,
      estimated_duration:
        typeof suggestion.estimated_duration === "number"
          ? suggestion.estimated_duration
          : typeof suggestion.duration === "number"
            ? suggestion.duration
            : typeof suggestion.minutes === "number"
              ? suggestion.minutes
              : null,
      suggested_time_block: {
        start: block.start as string | null,
        end: block.end as string | null,
      },
      reason: suggestion.reason,
      risk: suggestion.risk,
      confidence: Math.max(0, Math.min(1, suggestion.confidence)),
    };
  });

  return {
    intent: "schedule_suggestion",
    action: "preview_schedule",
    summary: record.summary,
    overload_days,
    suggestions,
    needs_user_confirmation: true,
  };
}

function CalendarView() {
  const { tasks, records, updateTask, selectTask, setView } = useAppStore();
  const [selected, setSelected] = useState(dayjs().format("YYYY-MM-DD"));
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">("month");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreviewState>({
    loading: false,
    result: null,
    raw: null,
    error: null,
    source: null,
  });
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const selectedDay = dayjs(selected);
  const todayKey = dayjs().format("YYYY-MM-DD");
  const activeTasks = tasks.filter((task) => task.status !== "archived");
  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, index) => selectedDay.startOf("month").startOf("week").add(index, "day")),
    [selected],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => selectedDay.startOf("week").add(index, "day")),
    [selected],
  );
  const getTaskDate = (task: Task) => task.planned_date?.slice(0, 10) ?? "";
  const getDayTasks = (date: dayjs.Dayjs) =>
    activeTasks
      .filter((task) => getTaskDate(task) === date.format("YYYY-MM-DD"))
      .sort((a, b) => a.quadrant - b.quadrant || b.sort_order - a.sort_order);
  const getDayWorkload = (date: dayjs.Dayjs) => {
    const dayTasks = getDayTasks(date);
    const incompleteTasks = dayTasks.filter((task) => task.status !== "done");
    const completedTasks = dayTasks.filter((task) => task.status === "done");
    const estimatedMinutes = incompleteTasks.reduce((sum, task) => sum + (task.estimated_duration ?? 0), 0);
    const unestimatedCount = incompleteTasks.filter((task) => !task.estimated_duration || task.estimated_duration <= 0).length;
    const hours = estimatedMinutes / 60;
    const state =
      estimatedMinutes === 0
        ? { label: "空闲", tone: "idle", description: "当天没有已估时的未完成任务。" }
        : hours <= 3
          ? { label: "轻负荷", tone: "light", description: "预计工作量较轻，可以补充估时或安排低压任务。" }
          : hours <= 6
            ? { label: "正常", tone: "normal", description: "当天负荷处于常规范围。" }
            : hours <= 8
              ? { label: "偏满", tone: "full", description: "当天安排偏满，建议优先处理高影响任务。" }
              : { label: "过载", tone: "overload", description: "当天预计工作量超过 8 小时，建议改期部分任务。" };
    return {
      tasks: dayTasks,
      totalCount: dayTasks.length,
      incompleteCount: incompleteTasks.length,
      completedCount: completedTasks.length,
      estimatedMinutes,
      unestimatedCount,
      state,
    };
  };
  const selectedTasks = getDayTasks(selectedDay);
  const selectedWorkload = getDayWorkload(selectedDay);
  const selectedEstimatedMinutes = selectedWorkload.estimatedMinutes;
  const selectedUnestimatedCount = selectedWorkload.unestimatedCount;
  const selectedRecords = records
    .filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === selected)
    .sort((a, b) => dayjs(a.started_at).valueOf() - dayjs(b.started_at).valueOf());
  const selectedRecordMinutes = selectedRecords.reduce((sum, record) => sum + record.duration, 0);
  const future7Days = useMemo(() => Array.from({ length: 7 }, (_, index) => dayjs().add(index, "day").format("YYYY-MM-DD")), []);
  const buildScheduleContext = () => {
    const incompleteTasks = activeTasks.filter((task) => task.status !== "done");
    const taskPayload = (task: Task) => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline ?? null,
      planned_date: task.planned_date ?? null,
      estimated_duration: task.estimated_duration ?? null,
      priority: task.priority,
      urgency: task.urgency,
      importance: task.importance,
      tags: parseTags(task),
      status: task.status,
      quadrant: task.quadrant,
      overdue: (() => {
        const key = task.deadline ? dayjs(task.deadline).format("YYYY-MM-DD") : task.planned_date?.slice(0, 10);
        return !!key && dayjs(key).isBefore(dayjs().startOf("day"), "day");
      })(),
    });
    const days = future7Days.map((date) => {
      const workload = getDayWorkload(dayjs(date));
      return {
        date,
        existing_tasks: workload.tasks.map(taskPayload),
        load_minutes: workload.estimatedMinutes,
        unestimated_task_count: workload.unestimatedCount,
        incomplete_count: workload.incompleteCount,
        completed_count: workload.completedCount,
        load_level:
          workload.state.tone === "overload"
            ? "overloaded"
            : workload.state.tone === "full"
              ? "full"
              : workload.state.tone === "normal"
                ? "normal"
                : workload.state.tone === "light"
                  ? "light"
                  : "idle",
      };
    });
    return {
      current_date: todayKey,
      future_7_days: future7Days,
      days,
      overload_days: days.filter((day) => day.load_minutes > 480),
      incomplete_tasks: incompleteTasks.map(taskPayload),
      overdue_tasks: incompleteTasks.filter((task) => taskPayload(task).overdue).map(taskPayload),
      important_or_urgent_tasks: incompleteTasks
        .filter((task) => task.importance === "important" || task.urgency === "urgent")
        .map(taskPayload),
    };
  };
  const buildMockScheduleSuggestion = (parseError?: string | null, raw?: string | null): SchedulePreviewState => {
    const context = buildScheduleContext();
    const lowLoadDays = [...context.days].sort((a, b) => a.load_minutes - b.load_minutes);
    const suggestions: ScheduleSuggestionItem[] = [];

    for (const overloaded of context.overload_days) {
      const targetDay = lowLoadDays.find((day) => day.date !== overloaded.date && day.load_minutes < 360);
      const moveCandidate = overloaded.existing_tasks
        .filter((task) => task.status !== "done")
        .sort((a, b) => {
          const aScore =
            (a.urgency === "urgent" ? 4 : 0) +
            (a.importance === "important" ? 3 : 0) +
            (a.deadline ? Math.max(0, 30 - dayjs(a.deadline).diff(dayjs(), "day")) : 0);
          const bScore =
            (b.urgency === "urgent" ? 4 : 0) +
            (b.importance === "important" ? 3 : 0) +
            (b.deadline ? Math.max(0, 30 - dayjs(b.deadline).diff(dayjs(), "day")) : 0);
          return aScore - bScore;
        })[0];
      if (moveCandidate && targetDay) {
        suggestions.push({
          type: "move_task",
          task_id: moveCandidate.id,
          title: moveCandidate.title,
          from_date: moveCandidate.planned_date?.slice(0, 10) ?? null,
          to_date: targetDay.date,
          estimated_duration: moveCandidate.estimated_duration ?? null,
          suggested_time_block: { start: "14:00", end: "15:30" },
          reason: `本地模拟建议：${overloaded.date} 已超过 8 小时，优先移动不紧急或不重要且期限较远的任务。`,
          risk: "这是开发预览规则，未结合真实个人作息和外部日历。",
          confidence: 0.62,
        });
      }
    }

    context.incomplete_tasks
      .filter((task) => !task.estimated_duration || task.estimated_duration <= 0)
      .slice(0, 6)
      .forEach((task) => {
        suggestions.push({
          type: "estimate_duration",
          task_id: task.id,
          title: task.title,
          from_date: task.planned_date?.slice(0, 10) ?? null,
          to_date: task.planned_date?.slice(0, 10) ?? null,
          estimated_duration: 60,
          suggested_time_block: { start: null, end: null },
          reason: "本地模拟建议：该任务缺少 estimated_duration，当前负荷统计可能偏低。",
          risk: "补估时前无法可靠判断当天是否过载。",
          confidence: 0.74,
        });
      });

    context.important_or_urgent_tasks.slice(0, 4).forEach((task) => {
      if (suggestions.some((item) => item.task_id === task.id)) return;
      suggestions.push({
        type: "keep",
        task_id: task.id,
        title: task.title,
        from_date: task.planned_date?.slice(0, 10) ?? null,
        to_date: task.planned_date?.slice(0, 10) ?? null,
        estimated_duration: task.estimated_duration ?? null,
        suggested_time_block: { start: null, end: null },
        reason: "本地模拟建议：任务紧急或重要，本轮先保留原日期。",
        risk: "如果同日还有外部会议，仍可能需要后续调整。",
        confidence: 0.58,
      });
    });

    const result: ScheduleSuggestionResult = {
      intent: "schedule_suggestion",
      action: "preview_schedule",
      summary: "本地模拟建议，仅用于开发预览。未调用或未成功解析真实 AI 返回，且不会修改任何任务。",
      overload_days: context.overload_days.map((day) => ({
        date: day.date,
        load_minutes: day.load_minutes,
        level: "overloaded",
        reason: "预计任务超过 8 小时",
      })),
      suggestions,
      needs_user_confirmation: true,
    };
    return { loading: false, result, raw: raw ?? null, error: parseError ?? null, source: "mock" };
  };
  const requestScheduleSuggestion = async () => {
    const context = buildScheduleContext();
    const prompt = [
      "You are SmartFocus schedule planner. Return strict JSON only. Do not modify any task.",
      "Use this exact JSON schema:",
      JSON.stringify(
        {
          intent: "schedule_suggestion",
          action: "preview_schedule",
          summary: "short schedule summary",
          overload_days: [
            {
              date: "YYYY-MM-DD",
              load_minutes: 540,
              level: "overloaded",
              reason: "why overloaded",
            },
          ],
          suggestions: [
            {
              type: "move_task|split_task|estimate_duration|keep|mark_needs_review",
              task_id: "string",
              title: "string",
              from_date: "YYYY-MM-DD|null",
              to_date: "YYYY-MM-DD|null",
              estimated_duration: 60,
              suggested_time_block: { start: "HH:mm|null", end: "HH:mm|null" },
              reason: "why",
              risk: "risk",
              confidence: 0.8,
            },
          ],
          needs_user_confirmation: true,
        },
        null,
        2,
      ),
      "Rules: preview only; never include task updates; quadrant is read-only; prefer moving low urgency/low importance tasks away from overloaded days; ask no follow-up.",
      `schedule_context=${JSON.stringify(context)}`,
    ].join("\n\n");

    setSchedulePreview({ loading: true, result: null, raw: null, error: null, source: null });
    if (!("__TAURI_INTERNALS__" in window)) {
      setSchedulePreview(buildMockScheduleSuggestion(null, null));
      setScheduleDialogOpen(true);
      return;
    }
    try {
      const response = await import("./lib/api").then(({ api }) =>
        api<Record<string, unknown>>("send_ai_message", { message: prompt }),
      );
      const raw = typeof response.reply === "string" ? response.reply : JSON.stringify(response, null, 2);
      try {
        const result =
          response.intent === "schedule_suggestion"
            ? validateScheduleSuggestion(response)
            : validateScheduleSuggestion(raw);
        setSchedulePreview({ loading: false, result, raw, error: null, source: "ai" });
        setScheduleDialogOpen(true);
      } catch (error) {
        setSchedulePreview(
          buildMockScheduleSuggestion(error instanceof Error ? error.message : "Failed to parse schedule JSON", raw),
        );
        setScheduleDialogOpen(true);
      }
    } catch (error) {
      setSchedulePreview(
        buildMockScheduleSuggestion(error instanceof Error ? error.message : "AI schedule request failed", null),
      );
      setScheduleDialogOpen(true);
    }
  };
  const viewTitle =
    calendarMode === "month"
      ? selectedDay.format("YYYY-MM")
      : calendarMode === "week"
        ? `${weekDays[0].format("MM-DD")} - ${weekDays[6].format("MM-DD")}`
        : selectedDay.format("YYYY-MM-DD");
  const taskColor = (task: Task) => `var(--prio-p${task.quadrant})`;
  const taskTimeLabel = (task: Task) => {
    const parsed = task.deadline ? dayjs(task.deadline) : null;
    return parsed?.isValid() ? parsed.format("HH:mm") : "All day";
  };
  const goToTask = (task: Task) => {
    selectTask(task.id);
    setView("tasks");
  };
  const shiftCalendar = (direction: -1 | 1) => {
    const unit = calendarMode === "month" ? "month" : calendarMode === "week" ? "week" : "day";
    setSelected(selectedDay.add(direction, unit).format("YYYY-MM-DD"));
  };
  const workloadBadgeClass = (tone: string) => `calendar-load-badge calendar-load-${tone}`;
  const workloadBarClass = (tone: string) => `calendar-load-bar calendar-load-${tone}`;
  const allowDateDrop = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const dragTask = (task: Task) => (event: DragEvent) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("task-id", task.id);
    event.dataTransfer.setData("text/plain", task.id);
  };
  const dropToDate = (date: string) => async (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("task-id");
    if (!id) {
      console.warn("Calendar drag reschedule failed: missing task id");
      return;
    }
    try {
      await updateTask({ id, planned_date: date });
      setSelected(date);
    } catch (error) {
      console.warn("Calendar drag reschedule failed", error);
    }
  };
  const renderDots = (items: Task[]) => (
    <div className="mt-2 flex min-h-3 flex-wrap gap-1">
      {items.slice(0, 8).map((task) => (
        <span
          key={task.id}
          draggable
          onDragStart={dragTask(task)}
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: taskColor(task), boxShadow: `0 0 18px ${taskColor(task)}` }}
          title={task.title}
        />
      ))}
    </div>
  );
  const renderTaskButton = (task: Task, compact = false) => (
    <button
      key={task.id}
      type="button"
      draggable
      onClick={() => goToTask(task)}
      onDragStart={dragTask(task)}
      className="calendar-task-row interactive-surface glass-inset flex w-full min-w-0 items-center gap-3 p-3 text-left hover:border-[var(--ring)]"
    >
      <PriorityDot quadrant={task.quadrant} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{task.title}</span>
        {!compact && (
          <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">
            Q{task.quadrant} {quadrantLabels[task.quadrant]} · {task.estimated_duration ? formatMinutes(task.estimated_duration) : "Unestimated"}
          </span>
        )}
      </span>
      <span className="shrink-0 rounded-full border border-[var(--glass-inset-border)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
        {taskTimeLabel(task)}
      </span>
    </button>
  );
  const renderDateCell = (day: dayjs.Dayjs, dense = false) => {
    const key = day.format("YYYY-MM-DD");
    const items = getDayTasks(day);
    const workload = getDayWorkload(day);
    const isToday = key === todayKey;
    const isOutsideMonth = calendarMode === "month" && day.month() !== selectedDay.month();
    return (
      <button
        key={key}
        className={`calendar-day-cell interactive-surface glass-inset ${dense ? "calendar-day-cell-compact" : ""} ${isOutsideMonth ? "opacity-45" : ""} p-3 text-left hover:border-[var(--ring)] ${selected === key ? "ring-2 ring-[var(--ring)]" : ""}`}
        onClick={() => setSelected(key)}
        onDragOver={allowDateDrop}
        onDrop={dropToDate(key)}
      >
        <div className="flex items-start justify-between gap-3 text-sm font-medium">
          <span className={isToday ? "rounded-full bg-[var(--neon-violet)] px-2 py-0.5 text-[var(--primary-foreground)] shadow-[var(--shadow-glow-violet)]" : ""}>
            {calendarMode === "month" ? day.date() : day.format("MM-DD")}
          </span>
          <span className="shrink-0 rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{items.length}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={workloadBadgeClass(workload.state.tone)}>{workload.state.label}</span>
          <span className="truncate text-xs text-[var(--muted-foreground)]">{formatMinutes(workload.estimatedMinutes)}</span>
        </div>
        <div className={workloadBarClass(workload.state.tone)} />
        {renderDots(items)}
      </button>
    );
  };
  const hasSchedulePreview = !!(schedulePreview.result || schedulePreview.error || schedulePreview.raw);
  const scheduleSuggestionCount = schedulePreview.result?.suggestions.length ?? 0;
  const scheduleOverloadCount = schedulePreview.result?.overload_days.length ?? 0;
  const scheduleEstimateCount = schedulePreview.result?.suggestions.filter((suggestion) => suggestion.type === "estimate_duration").length ?? 0;
  const suggestionLabel = (type: ScheduleSuggestionType) => {
    if (type === "move_task") return "Move";
    if (type === "split_task") return "Split";
    if (type === "estimate_duration") return "Estimate";
    if (type === "keep") return "Keep";
    return "Review";
  };
  const suggestionKey = (suggestion: ScheduleSuggestionItem) =>
    `${suggestion.type}:${suggestion.task_id}:${suggestion.from_date ?? "none"}:${suggestion.to_date ?? "none"}:${suggestion.estimated_duration ?? "none"}:${suggestion.suggested_time_block.start ?? "none"}:${suggestion.suggested_time_block.end ?? "none"}`;
  const renderSuggestionGroup = (title: string, types: ScheduleSuggestionType[]) => {
    const items = schedulePreview.result?.suggestions.filter((suggestion) => types.includes(suggestion.type)) ?? [];
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--muted-foreground)]">{title}</h4>
        {items.map((suggestion) => (
          <div key={suggestionKey(suggestion)} className="schedule-suggestion-item glass-inset p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{suggestion.title}</div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {suggestion.from_date ?? "未安排"} {suggestion.to_date ? `-> ${suggestion.to_date}` : ""}
                  {suggestion.suggested_time_block.start && suggestion.suggested_time_block.end
                    ? ` · ${suggestion.suggested_time_block.start}-${suggestion.suggested_time_block.end}`
                    : ""}
                </div>
              </div>
              <span className="schedule-suggestion-type rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs">
                {suggestionLabel(suggestion.type)}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Reason: {suggestion.reason}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Risk: {suggestion.risk}</p>
            <div className="mt-2 text-xs text-[var(--muted-foreground)]" >置信度 {Math.round(suggestion.confidence * 100)}%</div>
          </div>
        ))}
      </div>
    );
  };
  return (
    <>
    <section className="glass-card animate-rise flex h-full min-h-0 flex-col overflow-hidden p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label flex items-center gap-2">
            <CalendarDays size={15} /> Calendar
          </p>
          <h1 className="mt-2 text-2xl font-semibold">日程</h1>
          <p className="text-sm text-[var(--muted-foreground)]">月 / 周 / 日视图，查看任务、工作负荷和当天计时记录。</p>
        </div>
        <div className="calendar-toolbar flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="glass-inset flex shrink-0 p-1 text-sm">
            <button type="button" className="rounded-lg px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => shiftCalendar(-1)} aria-label="Previous period">
              ←
            </button>
            <span className="grid min-w-32 place-items-center px-3 font-semibold">{viewTitle}</span>
            <button type="button" className="rounded-lg px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => shiftCalendar(1)} aria-label="Next period">
              →
            </button>
          </div>
          <button type="button" className="glass-inset shrink-0 px-3 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setSelected(todayKey)}>
            今天
          </button>
          <button
            type="button"
            className="btn-glow shrink-0 rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            onClick={requestScheduleSuggestion}
            disabled={schedulePreview.loading}
          >
            {schedulePreview.loading ? "生成中..." : "生成本周排程建议"}
          </button>
          <div className="glass-inset flex shrink-0 p-1 text-sm">
            {(["month", "week", "day"] as const).map((mode) => (
              <button key={mode} className={`rounded-lg px-3 py-1.5 [transition:var(--transition-smooth)] ${calendarMode === mode ? "btn-glow" : "text-[var(--muted-foreground)]"}`} onClick={() => setCalendarMode(mode)}>
                {mode === "month" ? "月" : mode === "week" ? "周" : "日"}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="calendar-layout grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={`thin-scrollbar min-h-0 ${calendarMode === "month" ? "calendar-month-scroll" : calendarMode === "week" ? "calendar-week-scroll" : "overflow-auto"}`}>
          {calendarMode === "month" && <div className="calendar-month-grid">{monthDays.map((day) => renderDateCell(day))}</div>}
          {calendarMode === "week" && (
            <div className="calendar-week-grid">
              {weekDays.map((day) => {
                const key = day.format("YYYY-MM-DD");
                const items = getDayTasks(day);
                const workload = getDayWorkload(day);
                const isToday = key === todayKey;
                return (
                  <section key={key} className={`calendar-week-column glass-inset ${selected === key ? "ring-2 ring-[var(--ring)]" : ""}`} onDragOver={allowDateDrop} onDrop={dropToDate(key)}>
                    <button type="button" className="w-full text-left" onClick={() => setSelected(key)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-[var(--muted-foreground)]">{day.format("ddd")}</div>
                          <div className={`mt-1 inline-grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-semibold ${isToday ? "bg-[var(--neon-violet)] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-violet)]" : ""}`}>
                            {day.format("MM-DD")}
                          </div>
                        </div>
                        <span className="rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{items.length} 项</span>
                      </div>
                    </button>
                    <div className="mt-3 grid gap-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={workloadBadgeClass(workload.state.tone)}>{workload.state.label}</span>
                        <span className="text-[var(--muted-foreground)]">{formatMinutes(workload.estimatedMinutes)}</span>
                      </div>
                      <div className={workloadBarClass(workload.state.tone)} />
                      <div className="text-[var(--muted-foreground)]">
                        {workload.incompleteCount} 未完成 / {workload.completedCount} 已完成
                        {workload.unestimatedCount ? ` · ${workload.unestimatedCount} 项未估时` : ""}
                      </div>
                    </div>
                    {renderDots(items)}
                    <div className="thin-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                      {items.map((task) => renderTaskButton(task, true))}
                      {items.length === 0 && <div className="calendar-empty-state">无任务</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {calendarMode === "day" && (
            <div className="calendar-day-panel glass-card min-h-full p-5" onDragOver={allowDateDrop} onDrop={dropToDate(selected)}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-[var(--muted-foreground)]">{selectedDay.format("dddd")}</div>
                  <h2 className="text-2xl font-semibold">{selectedDay.format("YYYY-MM-DD")}</h2>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <Info label="任务" value={`${selectedTasks.length}`} />
                  <Info label="预计" value={formatMinutes(selectedEstimatedMinutes)} />
                  <Info label="记录" value={formatMinutes(selectedRecordMinutes)} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]">
                <div className="glass-inset p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">当天负荷摘要</span>
                    <span className={workloadBadgeClass(selectedWorkload.state.tone)}>{selectedWorkload.state.label}</span>
                  </div>
                  <div className={workloadBarClass(selectedWorkload.state.tone)} />
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">{selectedWorkload.state.description}</p>
                </div>
                <div className="glass-inset p-4 text-sm text-[var(--muted-foreground)]">
                  <div>{selectedWorkload.incompleteCount} 项未完成 / {selectedWorkload.completedCount} 项已完成</div>
                  <div className="mt-1">{selectedUnestimatedCount ? `${selectedUnestimatedCount} 项未估时，建议补充预计时长。` : "未完成任务均已估时。"}</div>
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">当天任务</h3>
                  <div className="space-y-2">
                    {selectedTasks.map((task) => renderTaskButton(task))}
                    {selectedTasks.length === 0 && <div className="calendar-empty-state">这一天还没有安排任务。</div>}
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="glass-inset p-4">
                    <div className="text-xs text-[var(--muted-foreground)]">预计工作负荷</div>
                    <div className="mt-2 text-2xl font-semibold">{formatMinutes(selectedEstimatedMinutes)}</div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {selectedUnestimatedCount ? `${selectedUnestimatedCount} 项未估时` : "所有任务已估时"}
                    </div>
                  </div>
                  <div className="glass-inset p-4">
                    <div className="text-xs text-[var(--muted-foreground)]">计时记录摘要</div>
                    <div className="mt-2 text-2xl font-semibold">{formatMinutes(selectedRecordMinutes)}</div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">{selectedRecords.length} 条记录</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <aside className="calendar-detail-sidebar glass-card flex min-h-0 flex-col overflow-hidden p-4">
          <div className="shrink-0">
            <p className="section-label">Selected Day</p>
            <h3 className="mt-1 font-semibold">{selected}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Info label="任务数量" value={`${selectedTasks.length}`} />
              <Info label="预计负荷" value={formatMinutes(selectedEstimatedMinutes)} />
              <Info label="未完成" value={`${selectedWorkload.incompleteCount}`} />
              <Info label="已完成" value={`${selectedWorkload.completedCount}`} />
            </div>
            <div className="mt-3 glass-inset p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={workloadBadgeClass(selectedWorkload.state.tone)}>{selectedWorkload.state.label}</span>
                <span className="text-sm font-semibold">{formatMinutes(selectedEstimatedMinutes)}</span>
              </div>
              <div className={workloadBarClass(selectedWorkload.state.tone)} />
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{selectedWorkload.state.description}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {selectedUnestimatedCount ? `${selectedUnestimatedCount} 项未估时` : "当天未完成任务均已估时"} · 计时 {formatMinutes(selectedRecordMinutes)}
              </p>
            </div>
            <div className="mt-3 glass-inset p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="section-label">AI Schedule</p>
                  <h4 className="mt-1 text-sm font-semibold">排程建议</h4>
                </div>
                <span className="rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                  {schedulePreview.loading ? "生成中" : hasSchedulePreview ? "已生成" : "未生成"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Info label="建议" value={`${scheduleSuggestionCount}`} />
                <Info label="过载" value={`${scheduleOverloadCount}`} />
                <Info label="补估时" value={`${scheduleEstimateCount}`} />
              </div>
              {schedulePreview.error && (
                <p className="mt-2 text-xs leading-5 text-[var(--destructive)]">JSON 解析失败，可在详情中查看原文。</p>
              )}
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-[var(--glass-inset-border)] px-3 py-2 text-sm font-semibold text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:border-[var(--ring)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setScheduleDialogOpen(true)}
                  disabled={!hasSchedulePreview}
                >
                  查看详情
                </button>
                <button
                  type="button"
                  className="btn-glow rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={requestScheduleSuggestion}
                  disabled={schedulePreview.loading}
                >
                  {schedulePreview.loading ? "正在生成建议..." : "重新生成本周排程建议"}
                </button>
              </div>
            </div>
          </div>
          <div className="thin-scrollbar mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {selectedTasks.map((task) => renderTaskButton(task))}
            {selectedTasks.length === 0 && <div className="calendar-empty-state">这一天还没有安排任务。</div>}
            {selectedRecords.length > 0 && (
              <div className="pt-3">
                <h4 className="mb-2 text-sm font-semibold text-[var(--muted-foreground)]">计时记录</h4>
                <div className="space-y-2">
                  {selectedRecords.map((record) => (
                    <div key={record.id} className="glass-inset p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{record.task_topic || modeLabel(record.mode)}</span>
                        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatMinutes(record.duration)}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {dayjs(record.started_at).format("HH:mm")} - {dayjs(record.ended_at).format("HH:mm")} · {modeLabel(record.mode)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
    <ScheduleSuggestionDialog
      open={scheduleDialogOpen}
      preview={schedulePreview}
      onClose={() => setScheduleDialogOpen(false)}
      suggestionLabel={suggestionLabel}
      suggestionKey={suggestionKey}
    />
    </>
  );
}

interface ScheduleSuggestionDialogProps {
  open: boolean;
  preview: SchedulePreviewState;
  onClose: () => void;
  suggestionLabel: (type: ScheduleSuggestionType) => string;
  suggestionKey: (suggestion: ScheduleSuggestionItem) => string;
}

type ScheduleApplyStatus = "applied" | "skipped" | "failed";
type ScheduleApplyAction = "planned_date" | "needs_review" | "estimated_duration";

interface ScheduleApplyResult {
  status: ScheduleApplyStatus;
  action?: ScheduleApplyAction;
  message?: string;
}

interface ScheduleApplySummary {
  applied: number;
  skipped: number;
  failed: number;
  plannedDate: number;
  needsReview: number;
  estimatedDuration: number;
}

interface TaskStateSnapshot {
  planned_date: string | null;
  tags: string[];
  estimated_duration: number | null;
}

interface ApplyLogItem {
  task_id: string;
  title: string;
  before: TaskStateSnapshot;
  after: TaskStateSnapshot;
  changed_fields: string[];
}

function isValidDateKey(value?: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid() && dayjs(value).format("YYYY-MM-DD") === value;
}

function suggestedDurationMinutes(suggestion: ScheduleSuggestionItem) {
  const value = suggestion.estimated_duration;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function taskPlannedDate(task?: Task) {
  return task?.planned_date?.slice(0, 10) ?? null;
}

function deadlineBeforeDate(task: Task | undefined, date?: string | null) {
  if (!task?.deadline || !isValidDateKey(date)) return false;
  return dayjs(task.deadline).startOf("day").isBefore(dayjs(date), "day");
}

function isHighRiskText(value: string) {
  return /high|severe|critical|deadline|overdue|late|高|严重|截止|逾期|晚于/.test(value);
}

function workloadAfterMove(tasks: Task[], task: Task, toDate: string) {
  return tasks
    .filter((item) => item.status !== "archived" && item.status !== "done")
    .filter((item) => item.id !== task.id && taskPlannedDate(item) === toDate)
    .reduce((sum, item) => sum + (item.estimated_duration ?? 0), task.estimated_duration ?? 0);
}

function workloadAfterEstimate(tasks: Task[], task: Task, minutes: number) {
  const date = taskPlannedDate(task);
  if (!date) return 0;
  return tasks
    .filter((item) => item.status !== "archived" && item.status !== "done")
    .filter((item) => item.id !== task.id && taskPlannedDate(item) === date)
    .reduce((sum, item) => sum + (item.estimated_duration ?? 0), minutes);
}

function buildScheduleReview(
  suggestion: ScheduleSuggestionItem,
  key: string,
  tasks: Task[],
): {
  key: string;
  suggestion: ScheduleSuggestionItem;
  task?: Task;
  disabled: boolean;
  defaultChecked: boolean;
  reasons: string[];
  warnings: string[];
  suggestedDuration: number | null;
  suggestedTags: string[];
} {
  const task = tasks.find((item) => item.id === suggestion.task_id);
  const suggestedDuration = suggestedDurationMinutes(suggestion);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const suggestedTags = suggestion.type === "mark_needs_review" ? ["待整理"] : [];
  const highRisk = isHighRiskText(suggestion.risk);

  if (!task) reasons.push("task_id 找不到");
  if (task?.status === "done") reasons.push("任务已完成");

  if (suggestion.type === "move_task") {
    if (!isValidDateKey(suggestion.to_date)) reasons.push("to_date 为空或无效");
    const toDate = suggestion.to_date;
    if (task && isValidDateKey(toDate)) {
      if (workloadAfterMove(tasks, task, toDate) > 480) warnings.push("应用后仍可能过载");
      if (deadlineBeforeDate(task, toDate)) {
        warnings.push("可能晚于截止时间");
        if (highRisk) reasons.push("deadline 早于建议日期且风险较高");
      }
    }
  } else if (suggestion.type === "mark_needs_review") {
    if (!task) reasons.push("缺少可标记任务");
  } else if (suggestion.type === "estimate_duration") {
    if (!suggestedDuration) reasons.push("duration 为空或不合法");
    if (task && suggestedDuration && workloadAfterEstimate(tasks, task, suggestedDuration) > 480) {
      warnings.push("应用后仍可能过载");
    }
  } else if (suggestion.type === "split_task") {
    reasons.push("本轮不应用 split_task");
  } else if (suggestion.type === "keep") {
    reasons.push("keep 不需要写入任务");
  }

  if (
    suggestion.type !== "move_task" &&
    suggestion.type !== "mark_needs_review" &&
    suggestion.type !== "estimate_duration" &&
    (suggestion.suggested_time_block.start || suggestion.suggested_time_block.end)
  ) {
    reasons.push("suggested_time_block 只有时间但没有可写日期");
  }

  const disabled = reasons.length > 0;
  const defaultChecked =
    !disabled &&
    ((suggestion.type === "move_task" && !!task && isValidDateKey(suggestion.to_date) && warnings.length === 0) ||
      (suggestion.type === "mark_needs_review" && !!task) ||
      (suggestion.type === "estimate_duration" && !!task && !!suggestedDuration && warnings.length === 0));

  return { key, suggestion, task, disabled, defaultChecked, reasons, warnings, suggestedDuration, suggestedTags };
}

function emptyScheduleApplySummary(): ScheduleApplySummary {
  return { applied: 0, skipped: 0, failed: 0, plannedDate: 0, needsReview: 0, estimatedDuration: 0 };
}

function ScheduleSuggestionDialog({ open, preview, onClose, suggestionLabel, suggestionKey }: ScheduleSuggestionDialogProps) {
  const { tasks, updateTask } = useAppStore();
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [applyResults, setApplyResults] = useState<Record<string, ScheduleApplyResult>>({});
  const [applySummary, setApplySummary] = useState<ScheduleApplySummary | null>(null);
  const [applyLog, setApplyLog] = useState<ApplyLogItem[]>([]);
  const [lastUndoUsed, setLastUndoUsed] = useState(true);
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const groupedSuggestions = useMemo(
    () => [
      { title: "移动任务", types: ["move_task"] as ScheduleSuggestionType[] },
      { title: "补估时", types: ["estimate_duration"] as ScheduleSuggestionType[] },
      { title: "标记待整理", types: ["mark_needs_review"] as ScheduleSuggestionType[] },
      { title: "保持不动", types: ["keep"] as ScheduleSuggestionType[] },
      { title: "拆分任务", types: ["split_task"] as ScheduleSuggestionType[] },
    ],
    [],
  );

  const result = preview.result;
  const reviewItems = useMemo(
    () =>
      result?.suggestions.map((suggestion) => buildScheduleReview(suggestion, suggestionKey(suggestion), tasks)) ?? [],
    [result, suggestionKey, tasks],
  );

  useEffect(() => {
    if (!open) return;
    setCheckedKeys(new Set(reviewItems.filter((item) => item.defaultChecked).map((item) => item.key)));
    setApplyResults({});
    setApplySummary(null);
  }, [open, result]);

  const selectedReviewItems = reviewItems.filter((item) => checkedKeys.has(item.key) && !item.disabled);
  const selectedTaskCount = new Set(selectedReviewItems.map((item) => item.suggestion.task_id)).size;
  const selectedMoveCount = selectedReviewItems.filter((item) => item.suggestion.type === "move_task").length;
  const selectedReviewCount = selectedReviewItems.filter((item) => item.suggestion.type === "mark_needs_review").length;
  const selectedEstimateCount = selectedReviewItems.filter((item) => item.suggestion.type === "estimate_duration").length;

  const toggleSuggestion = (key: string) => {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applySelectedSuggestions = async () => {
    if (selectedReviewItems.length === 0 || applying) return;
    const confirmed = window.confirm(
      [
        `将修改 ${selectedTaskCount} 个任务。`,
        `${selectedMoveCount} 个任务会改 planned_date。`,
        `${selectedReviewCount} 个任务会标记为待整理。`,
        `${selectedEstimateCount} 个任务会补 estimated_duration。`,
        "",
        "不会直接修改 quadrant。",
        "quadrant 仍由 Rust 根据 urgency + importance 计算。",
        "本轮不会写入 suggested_time_block。",
        "可以取消，取消后不会产生任何修改。",
      ].join("\n"),
    );
    if (!confirmed) return;

    setApplying(true);
    const nextResults: Record<string, ScheduleApplyResult> = { ...applyResults };
    const nextSummary = emptyScheduleApplySummary();
    const nextLog: ApplyLogItem[] = [];
    const selectedKeys = new Set(selectedReviewItems.map((item) => item.key));

    for (const item of reviewItems) {
      if (selectedKeys.has(item.key)) continue;
      nextResults[item.key] = {
        status: "skipped",
        message: item.disabled ? item.reasons.join("；") || "不可应用" : "未选中",
      };
      nextSummary.skipped += 1;
    }

    for (const item of selectedReviewItems) {
      const { key, suggestion, task, suggestedDuration } = item;
      try {
        if (!task) {
          nextResults[key] = { status: "skipped", message: "task_id 找不到" };
          nextSummary.skipped += 1;
        } else {
          const beforeState: TaskStateSnapshot = {
            planned_date: task.planned_date ?? null,
            tags: parseTags(task),
            estimated_duration: task.estimated_duration ?? null,
          };
          const afterState: TaskStateSnapshot = { ...beforeState };
          const changedFields: string[] = [];

          if (suggestion.type === "move_task") {
            if (!isValidDateKey(suggestion.to_date)) {
              nextResults[key] = { status: "skipped", message: "to_date 为空或无效" };
              nextSummary.skipped += 1;
              continue;
            } else {
              await updateTask({ id: task.id, planned_date: suggestion.to_date });
              nextResults[key] = { status: "applied", action: "planned_date" };
              afterState.planned_date = suggestion.to_date;
              changedFields.push("planned_date");
              nextSummary.applied += 1;
              nextSummary.plannedDate += 1;
            }
          } else if (suggestion.type === "mark_needs_review") {
            const tags = parseTags(task);
            if (tags.includes("待整理") || tags.includes("needs_review")) {
              nextResults[key] = { status: "skipped", message: "任务已标记待整理" };
              nextSummary.skipped += 1;
              continue;
            } else {
              const newTags = [...tags, "待整理"];
              await updateTask({ id: task.id, tags: newTags });
              nextResults[key] = { status: "applied", action: "needs_review" };
              afterState.tags = newTags;
              changedFields.push("tags");
              nextSummary.applied += 1;
              nextSummary.needsReview += 1;
            }
          } else if (suggestion.type === "estimate_duration") {
            if (!suggestedDuration) {
              nextResults[key] = { status: "skipped", message: "duration 为空或不合法" };
              nextSummary.skipped += 1;
              continue;
            } else {
              await updateTask({ id: task.id, estimated_duration: suggestedDuration });
              nextResults[key] = { status: "applied", action: "estimated_duration" };
              afterState.estimated_duration = suggestedDuration;
              changedFields.push("estimated_duration");
              nextSummary.applied += 1;
              nextSummary.estimatedDuration += 1;
            }
          } else {
            nextResults[key] = { status: "skipped", message: "本轮不应用该建议类型" };
            nextSummary.skipped += 1;
            continue;
          }
          
          if (changedFields.length > 0) {
            nextLog.push({
              task_id: task.id,
              title: task.title,
              before: beforeState,
              after: afterState,
              changed_fields: changedFields,
            });
          }
        }
      } catch (error) {
        nextResults[key] = {
          status: "failed",
          message: error instanceof Error ? error.message : "updateTask failed",
        };
        nextSummary.failed += 1;
      }
      setApplyResults({ ...nextResults });
    }

    await useAppStore.getState().load();
    setApplySummary(nextSummary);
    setApplyLog(nextLog);
    setLastUndoUsed(false);
    setApplying(false);
  };

  if (!open) return null;

  const suggestionCount = result?.suggestions.length ?? 0;
  const overloadCount = result?.overload_days.length ?? 0;
  const estimateCount = result?.suggestions.filter((suggestion) => suggestion.type === "estimate_duration").length ?? 0;
  const sourceLabel = preview.source === "mock" ? "本地模拟" : "AI 建议";

  return (
    <div className="schedule-dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center md:p-6" onClick={onClose}>
      <section
        className="schedule-dialog glass-card flex w-full max-w-[920px] flex-col overflow-hidden p-4 md:p-5"
        role="dialog"
        aria-modal="true"
        aria-label="本周排程建议"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--glass-inset-border)] pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">本周排程建议</h2>
              <span className="rounded-full border border-[var(--glass-inset-border)] bg-[var(--glass-inset-bg)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                {sourceLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">当前仅预览，不会修改任务。</p>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--glass-inset-border)] text-sm text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:border-[var(--ring)] hover:text-[var(--foreground)]"
            onClick={onClose}
            aria-label="关闭排程建议"
          >
            x
          </button>
        </header>

        <div className="schedule-dialog-body thin-scrollbar min-h-0 flex-1 overflow-auto py-4 pr-1">
          <section className="space-y-3">
            <div className="glass-inset p-4">
              <p className="section-label">Summary</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {result?.summary ?? (preview.loading ? "正在生成排程建议..." : "尚未生成排程建议。")}
              </p>
            </div>
            <div className="schedule-summary-grid">
              <Info label="建议总数" value={`${suggestionCount}`} />
              <Info label="过载日期" value={`${overloadCount}`} />
              <Info label="需要补估时" value={`${estimateCount}`} />
            </div>
          </section>

          {preview.error && (
            <section className="mt-4 glass-inset p-4">
              <p className="text-sm font-semibold text-[var(--destructive)]">JSON 解析失败</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{preview.error}</p>
              {preview.raw && (
                <pre className="thin-scrollbar mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--glass-inset-border)] bg-[var(--glass-inset-bg)] p-3 text-xs text-[var(--muted-foreground)]">
                  {preview.raw}
                </pre>
              )}
            </section>
          )}

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">Overload Days</h3>
              <span className="text-xs text-[var(--muted-foreground)]">{overloadCount} days</span>
            </div>
            {result?.overload_days.length ? (
              <div className="grid gap-2">
                {result.overload_days.map((day) => (
                  <div key={`${day.date}:${day.level}`} className="glass-inset p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{day.date}</span>
                      <span className="rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                        {formatMinutes(day.load_minutes)} / {day.level}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{day.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="calendar-empty-state">暂无过载日期。</div>
            )}
          </section>

          <section className="mt-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">Suggestions</h3>
            {result && suggestionCount > 0 ? (
              groupedSuggestions.map((group) => {
                const items = reviewItems.filter((item) => group.types.includes(item.suggestion.type));
                if (items.length === 0) return null;
                return (
                  <div key={group.title} className="space-y-2">
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    {items.map((item) => {
                      const { key, suggestion, task, disabled, reasons, warnings, suggestedDuration, suggestedTags } = item;
                      const currentTags = task ? parseTags(task) : [];
                      const itemResult = applyResults[key];
                      const timeBlock =
                        suggestion.suggested_time_block.start && suggestion.suggested_time_block.end
                          ? `${suggestion.suggested_time_block.start}-${suggestion.suggested_time_block.end}`
                          : "未指定";
                      return (
                        <article key={key} data-suggestion-key={key} className={`schedule-suggestion-item glass-inset p-3 text-sm ${disabled ? "opacity-70" : ""}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <label className="flex min-w-0 flex-1 items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 accent-[var(--neon-violet)] disabled:cursor-not-allowed"
                                checked={checkedKeys.has(key)}
                                disabled={disabled || applying}
                                onChange={() => toggleSuggestion(key)}
                              />
                              <span className="min-w-0">
                              <h5 className="truncate font-semibold">{suggestion.title}</h5>
                              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                                当前 {suggestion.from_date ?? "未安排"} / 建议 {suggestion.to_date ?? "不调整"} / {timeBlock}
                              </p>
                              </span>
                            </label>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              {itemResult && (
                                <span className={`rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs ${
                                  itemResult.status === "applied"
                                    ? "text-emerald-400"
                                    : itemResult.status === "failed"
                                      ? "text-[var(--destructive)]"
                                      : "text-[var(--muted-foreground)]"
                                }`}>
                                  {itemResult.status}
                                </span>
                              )}
                              <span className="schedule-suggestion-type rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs">
                                {suggestionLabel(suggestion.type)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-[var(--muted-foreground)] md:grid-cols-2">
                            <div className="glass-inset p-2">当前日期：{taskPlannedDate(task) ?? suggestion.from_date ?? "未安排"}</div>
                            <div className="glass-inset p-2">建议日期：{suggestion.to_date ?? "不调整"}</div>
                            <div className="glass-inset p-2">当前估时：{task?.estimated_duration ? formatMinutes(task.estimated_duration) : "未估时"}</div>
                            <div className="glass-inset p-2">建议估时：{suggestedDuration ? formatMinutes(suggestedDuration) : "无"}</div>
                            <div className="glass-inset p-2">当前 tags：{currentTags.length ? currentTags.join(", ") : "无"}</div>
                            <div className="glass-inset p-2">建议新增 tags：{suggestedTags.length ? suggestedTags.join(", ") : "无"}</div>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">原因：{suggestion.reason}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">风险：{suggestion.risk}</p>
                          <div className="mt-2 text-xs text-[var(--muted-foreground)]">置信度 {Math.round(suggestion.confidence * 100)}%</div>
                          {(warnings.length > 0 || reasons.length > 0 || itemResult?.message) && (
                            <div className="mt-2 space-y-1 text-xs leading-5">
                              {warnings.map((warning) => (
                                <p key={warning} className="text-[var(--neon-amber)]">{warning}</p>
                              ))}
                              {reasons.map((reason) => (
                                <p key={reason} className="text-[var(--destructive)]">不可应用：{reason}</p>
                              ))}
                              {itemResult?.message && <p className="text-[var(--muted-foreground)]">{itemResult.message}</p>}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="calendar-empty-state">暂无可展示的建议。</div>
            )}
          </section>
          
          {applyLog.length > 0 && (
            <section className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">本次修改摘要</h3>
              </div>
              <div className="space-y-2">
                {applyLog.map((log) => (
                  <div key={log.task_id} className="glass-inset p-3 text-xs">
                    <div className="font-semibold text-sm mb-1">{log.title}</div>
                    {log.changed_fields.includes("planned_date") && (
                      <div className="text-[var(--muted-foreground)]">
                        planned_date: <span className="line-through opacity-70">{log.before.planned_date?.slice(0, 10) ?? "空"}</span> → <span className="text-emerald-400">{log.after.planned_date?.slice(0, 10)}</span>
                      </div>
                    )}
                    {log.changed_fields.includes("tags") && (
                      <div className="text-[var(--muted-foreground)]">
                        tags: <span className="line-through opacity-70">[{log.before.tags.join(", ")}]</span> → <span className="text-emerald-400">[{log.after.tags.join(", ")}]</span>
                      </div>
                    )}
                    {log.changed_fields.includes("estimated_duration") && (
                      <div className="text-[var(--muted-foreground)]">
                        estimated_duration: <span className="line-through opacity-70">{log.before.estimated_duration ?? "空"}</span> → <span className="text-emerald-400">{log.after.estimated_duration} 分钟</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!lastUndoUsed && applySummary?.applied ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl border border-[var(--destructive)] px-3 py-2 text-sm font-semibold text-[var(--destructive)] [transition:var(--transition-smooth)] hover:bg-[var(--destructive)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={applying || undoing}
                  onClick={async () => {
                    const confirmed = window.confirm("将撤销本次应用？\n这只会恢复 planned_date, tags 和 estimated_duration。");
                    if (!confirmed) return;
                    setUndoing(true);
                    for (const log of applyLog) {
                      try {
                        const patch: TaskUpdatePatch = { id: log.task_id };
                        if (log.changed_fields.includes("planned_date")) patch.planned_date = log.before.planned_date ?? undefined;
                        if (log.changed_fields.includes("tags")) patch.tags = log.before.tags;
                        if (log.changed_fields.includes("estimated_duration")) patch.estimated_duration = log.before.estimated_duration ?? null;
                        await updateTask(patch);
                      } catch (e) {
                         alert(`撤销任务 ${log.title} 失败: ${e instanceof Error ? e.message : e}`);
                      }
                    }
                    await useAppStore.getState().load();
                    setLastUndoUsed(true);
                    setUndoing(false);
                    alert("撤销完成，列表已刷新");
                  }}
                >
                  {undoing ? "撤销中..." : "撤销上一次应用"}
                </button>
              ) : null}
            </section>
          )}
        </div>

        <footer className="schedule-dialog-actions shrink-0 border-t border-[var(--glass-inset-border)] pt-3">
          {applySummary && (
            <div className="mb-3 grid gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-3">
              <Info label="已应用" value={`${applySummary.applied}`} />
              <Info label="跳过" value={`${applySummary.skipped}`} />
              <Info label="失败" value={`${applySummary.failed}`} />
              <Info label="改 planned_date" value={`${applySummary.plannedDate}`} />
              <Info label="标记待整理" value={`${applySummary.needsReview}`} />
              <Info label="补 estimated_duration" value={`${applySummary.estimatedDuration}`} />
            </div>
          )}
          <button
            type="button"
            className="btn-glow w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            disabled={selectedReviewItems.length === 0 || applying}
            onClick={applySelectedSuggestions}
          >
            {applying ? "正在应用..." : `应用选中建议（${selectedReviewItems.length}）`}
          </button>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
            只会写入 planned_date、tags 或 estimated_duration；不会直接修改 quadrant、urgency、importance、deadline，也不会写入 suggested_time_block。
          </p>
        </footer>
      </section>
    </div>
  );
}

function CalendarViewLegacy() {
  const { tasks, updateTask } = useAppStore();
  const [selected, setSelected] = useState(dayjs().format("YYYY-MM-DD"));
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">("month");
  const selectedDay = dayjs(selected);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => selectedDay.startOf("month").startOf("week").add(index, "day")), [selected]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => selectedDay.startOf("week").add(index, "day")), [selected]);
  const selectedTasks = tasks.filter((task) => task.planned_date === selected);
  const dayTasks = (date: dayjs.Dayjs) => tasks.filter((task) => task.planned_date === date.format("YYYY-MM-DD"));
  const taskColor = (task: Task) => (task.priority === "high" ? "var(--prio-p1)" : task.priority === "medium" ? "var(--prio-p2)" : "var(--prio-p3)");
  const dropToDate = (date: string) => (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("task-id");
    if (id) updateTask({ id, planned_date: date });
  };
  const renderDots = (items: Task[]) => (
    <div className="mt-2 flex min-h-3 flex-wrap gap-1">
      {items.map((task) => (
        <span
          key={task.id}
          draggable
          onDragStart={(event) => event.dataTransfer.setData("task-id", task.id)}
          className={`h-2.5 w-2.5 rounded-full ${
            task.quadrant === 1
              ? "shadow-[0_0_18px_var(--prio-p1)]"
              : task.quadrant === 2
                ? "shadow-[0_0_18px_var(--prio-p2)]"
                : task.quadrant === 3
                  ? "shadow-[0_0_18px_var(--prio-p3)]"
                  : "shadow-[0_0_18px_var(--prio-p4)]"
          }`}
          style={{ color: taskColor(task), background: taskColor(task) }}
          title={task.title}
        />
      ))}
    </div>
  );
  const renderDateCell = (day: dayjs.Dayjs, dense = false) => {
    const key = day.format("YYYY-MM-DD");
    const items = dayTasks(day);
    const isToday = key === dayjs().format("YYYY-MM-DD");
    return (
      <button key={key} className={`calendar-day-cell interactive-surface glass-inset ${dense ? "calendar-day-cell-compact" : ""} p-3 text-left hover:border-[var(--ring)] ${selected === key ? "ring-2 ring-[var(--ring)]" : ""}`} onClick={() => setSelected(key)} onDragOver={(event) => event.preventDefault()} onDrop={dropToDate(key)}>
        <div className="flex items-start justify-between gap-3 text-sm font-medium">
          <span className={isToday ? "rounded-full bg-[var(--neon-violet)] px-2 py-0.5 text-[var(--primary-foreground)]" : ""}>{calendarMode === "month" ? day.date() : day.format("MM-DD")}</span>
          <span className="shrink-0 rounded-full border border-[var(--glass-inset-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{items.length}</span>
        </div>
        {renderDots(items)}
      </button>
    );
  };
  return (
    <section className="glass-card flex h-full flex-col p-5">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">日程</h1>
          <p className="text-sm opacity-65">月/周/日视图任务小圆点、点击查看、拖拽改期</p>
        </div>
        <div className="glass-inset flex p-1 text-sm">
          <button type="button" className="rounded-lg px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setSelected(selectedDay.subtract(1, "month").format("YYYY-MM-DD"))} aria-label="上个月">
            ←
          </button>
          <span className="grid min-w-28 place-items-center px-3 font-semibold">{selectedDay.format("YYYY-MM")}</span>
          <button type="button" className="rounded-lg px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setSelected(selectedDay.add(1, "month").format("YYYY-MM-DD"))} aria-label="下个月">
            →
          </button>
          {(["month", "week", "day"] as const).map((mode) => (
            <button key={mode} className={`rounded-lg px-3 py-1.5 [transition:var(--transition-smooth)] ${calendarMode === mode ? "btn-glow" : "text-[var(--muted-foreground)]"}`} onClick={() => setCalendarMode(mode)}>
              {mode === "month" ? "月" : mode === "week" ? "周" : "日"}
            </button>
          ))}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`thin-scrollbar min-h-0 ${calendarMode === "month" ? "calendar-month-scroll" : calendarMode === "week" ? "calendar-week-scroll" : "overflow-auto"}`}>
          {calendarMode === "month" && (
            <div className="calendar-month-grid">
              {monthDays.map((day) => renderDateCell(day))}
            </div>
          )}
          {calendarMode === "week" && (
            <div className="calendar-week-grid">
              {weekDays.map((day) => renderDateCell(day, true))}
            </div>
          )}
          {calendarMode === "day" && (
            <div className="glass-card min-h-full p-5" onDragOver={(event) => event.preventDefault()} onDrop={dropToDate(selected)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-60">{selectedDay.format("dddd")}</div>
                  <h2 className="text-2xl font-semibold">{selectedDay.format("YYYY-MM-DD")}</h2>
                </div>
                <div className="text-sm opacity-70">{selectedTasks.length} 项</div>
              </div>
              {renderDots(selectedTasks)}
            </div>
          )}
        </div>
        <aside className="glass-card p-4">
          <h3 className="font-semibold">{selected}</h3>
          <p className="mt-1 text-sm opacity-70">工作负荷：预估 {formatMinutes(selectedTasks.reduce((sum, task) => sum + (task.estimated_duration ?? 0), 0))}</p>
          <div className="mt-4 space-y-2">
            {selectedTasks.map((task) => <div key={task.id} className="glass-inset p-3 text-sm">{task.title}</div>)}
            {selectedTasks.length === 0 && <p className="text-sm opacity-60">这天还没有安排。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function parseAiStreamDelta(raw: string) {
  const endsWithNewline = /\r?\n$/.test(raw);
  const lines = raw.split(/\r?\n/);
  const rest = endsWithNewline ? "" : (lines.pop() ?? "");
  let parsed = "";
  let sawSseData = false;
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    sawSseData = true;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      parsed += json.choices?.[0]?.delta?.content ?? "";
    } catch {
      parsed += data;
    }
  }
  return { delta: sawSseData ? parsed : "", rest };
}

function SettingsView() {
  const { theme, setTheme } = useAppStore();
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.deepseek.com/v1");
  const [apiModel, setApiModel] = useState("deepseek-chat");
  const [saved, setSaved] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [shortcuts, setShortcuts] = useState({
    toggle_ai: "Ctrl+Shift+A",
    toggle_window: "Ctrl+Shift+T",
    toggle_timer: "Ctrl+Shift+S",
  });
  const [shortcutSaved, setShortcutSaved] = useState(false);
  const [shortcutError, setShortcutError] = useState("");

  useEffect(() => {
    import("./lib/api")
      .then(async ({ api }) => {
        const [settings, baseUrl, model, existingKey] = await Promise.all([
          api<typeof shortcuts>("get_shortcut_settings"),
          api<string | null>("get_setting", { key: "api_base_url" }),
          api<string | null>("get_setting", { key: "api_model" }),
          api<string | null>("get_setting", { key: "deepseek_api_key" }),
        ]);
        setShortcuts(settings);
        setApiBaseUrl(baseUrl || "https://api.deepseek.com/v1");
        setApiModel(model || "deepseek-chat");
        setHasSavedApiKey(!!existingKey);
      })
      .catch(() => undefined);
  }, []);

  const updateShortcut = (key: keyof typeof shortcuts, value: string) => {
    setShortcutSaved(false);
    setShortcutError("");
    setShortcuts((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="glass-card h-full overflow-auto p-5">
      <Header title="设置" subtitle="DeepSeek API Key、主题和番茄钟参数" />
      <div className="mt-6 max-w-2xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">DeepSeek API Key</span>
          <input className="field w-full" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder={hasSavedApiKey ? "已保存，重新输入可覆盖" : "sk-..."} />
          {hasSavedApiKey && <span className="mt-1 block text-xs text-emerald-400">已保存</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">API Base URL</span>
          <input className="field w-full" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Model</span>
          <input className="field w-full" value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder="deepseek-chat" />
        </label>
        <button
          className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold"
          onClick={async () => {
            await import("./lib/api").then(async ({ api }) => {
              await Promise.all([
                ...(apiKey ? [api("save_setting", { key: "deepseek_api_key", value: apiKey })] : []),
                api("save_setting", { key: "api_base_url", value: apiBaseUrl }),
                api("save_setting", { key: "api_model", value: apiModel }),
              ]);
            });
            setSaved(true);
            if (apiKey) {
              setHasSavedApiKey(true);
              setApiKey("");
            }
            showToast("API Key 已保存");
          }}
        >
          保存 API 设置
        </button>
        {saved && <p className="text-sm text-emerald-400">已保存到本地设置。</p>}
        <div>
          <span className="mb-2 block text-sm font-medium">主题</span>
          <div className="flex gap-2">
            <button className={`glass-inset px-4 py-2 text-sm ${theme === "light" ? "btn-glow font-semibold" : ""}`} onClick={() => setTheme("light")}>浅色</button>
            <button className={`glass-inset px-4 py-2 text-sm ${theme === "dark" ? "btn-glow font-semibold" : ""}`} onClick={() => setTheme("dark")}>深色</button>
            <span className="self-center text-sm opacity-70">当前：{theme}</span>
          </div>
        </div>
        <div className="glass-card p-4">
          <span className="mb-3 block text-sm font-medium">全局快捷键</span>
          <div className="grid gap-3">
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="opacity-70">AI 面板</span>
              <input className="field" value={shortcuts.toggle_ai} onChange={(event) => updateShortcut("toggle_ai", event.target.value)} />
            </label>
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="opacity-70">显示/隐藏主窗口</span>
              <input className="field" value={shortcuts.toggle_window} onChange={(event) => updateShortcut("toggle_window", event.target.value)} />
            </label>
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="opacity-70">开始/暂停计时</span>
              <input className="field" value={shortcuts.toggle_timer} onChange={(event) => updateShortcut("toggle_timer", event.target.value)} />
            </label>
            <div className="flex items-center gap-3">
              <button
                className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold"
                onClick={async () => {
                  setShortcutSaved(false);
                  setShortcutError("");
                  try {
                    const savedSettings = await import("./lib/api").then(({ api }) => api<typeof shortcuts>("update_shortcut_settings", { settings: shortcuts }));
                    setShortcuts(savedSettings);
                    setShortcutSaved(true);
                  } catch (error) {
                    setShortcutError(error instanceof Error ? error.message : "快捷键保存失败");
                  }
                }}
              >
                保存快捷键
              </button>
              {shortcutSaved && <span className="text-sm text-emerald-400">已更新</span>}
              {shortcutError && <span className="text-sm text-red-400">{shortcutError}</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="section-label">SmartFocus</p>
        <h1 className="neon-text text-2xl font-semibold">{title}</h1>
        <p className="text-sm opacity-65">{subtitle}</p>
      </div>
    </header>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-card p-4">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-[var(--neon-violet)] shadow-[var(--shadow-glow-violet)]">
        <BarChart3 size={16} />
      </div>
      <div className="text-sm opacity-70">{label}</div>
      <div className="neon-text mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "blue" | "violet" | "pink" | "amber" }) {
  const color = tone === "blue" ? "var(--neon-blue)" : tone === "pink" ? "var(--neon-pink)" : tone === "amber" ? "var(--neon-amber)" : "var(--neon-violet)";
  return (
    <div className="glass-inset interactive-surface quick-stat-card flex min-h-[64px] min-w-0 items-center gap-3 p-3 hover:border-[var(--ring)]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--background)]" style={{ background: color, boxShadow: `0 0 24px -4px ${color}` }}>
        <BarChart3 size={15} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs leading-tight text-[var(--muted-foreground)]">{label}</div>
        <div className="mt-1 truncate font-mono text-base font-semibold leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Achievement({ label, current, total }: { label: string; current: number; total: number }) {
  const progress = total ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="glass-inset interactive-surface p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-[var(--muted-foreground)]">{current}/{total}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--muted)] shadow-[inset_0_1px_2px_oklch(0_0_0_/_0.2)]">
        <div
          className="h-full animate-shimmer animate-[shimmer_2.4s_linear_infinite] rounded-full bg-[linear-gradient(90deg,var(--neon-violet),var(--neon-blue),var(--neon-pink),var(--neon-violet))] bg-[length:200%_100%] shadow-[0_0_18px_var(--neon-violet)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function PriorityDot({ quadrant }: { quadrant: number }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
        quadrant === 1
          ? "shadow-[0_0_18px_var(--prio-p1)]"
          : quadrant === 2
            ? "shadow-[0_0_18px_var(--prio-p2)]"
            : quadrant === 3
              ? "shadow-[0_0_18px_var(--prio-p3)]"
              : "shadow-[0_0_18px_var(--prio-p4)]"
      }`}
      style={{ color: `var(--prio-p${quadrant})`, background: `var(--prio-p${quadrant})` }}
    />
  );
}

function TimerOrb({ seconds, progress, paused = false, compact = false, mode = "positive" }: { seconds: number; progress: number; paused?: boolean; compact?: boolean; mode?: TimerMode }) {
  const progressDegrees = Math.min(100, Math.max(0, progress)) * 3.6;
  
  // Liquid physics: positive rises, others drop
  let liquidFillPercentage = progress;
  if (mode === "pomodoro" || mode === "countdown") {
    liquidFillPercentage = 100 - progress;
  } else {
    // positive starts at base 5% to show some liquid
    liquidFillPercentage = Math.max(5, progress);
  }

  const waveLevel = 84 - (liquidFillPercentage * 0.70); // up to ~14% from top when full
  
  const modeColor = 
    mode === "pomodoro" ? "oklch(0.68 0.22 350)" : // elegant pink/red
    mode === "countdown" ? "oklch(0.72 0.20 50)" :  // glass orange/gold
    "oklch(0.65 0.20 250)";                         // positive: cyan-blue/indigo

  const isIdle = progress === 0 && paused;
  const isFinished = progress >= 100;
  const isRunning = !paused && !isFinished && progress > 0;
  
  let stateClass = "";
  if (isFinished) stateClass = "timer-state-finished";
  else if (paused) stateClass = "timer-state-paused";
  else if (isIdle) stateClass = "timer-state-idle";
  else stateClass = "timer-state-running";

  return (
    <div
      className={`timer-orb relative mx-auto grid place-items-center overflow-visible rounded-full ${stateClass} ${paused ? "outline-dashed outline-2 outline-offset-4 outline-[var(--ring)] opacity-80" : ""}`}
      style={{
        width: compact ? "clamp(170px, 16vw, 230px)" : "clamp(180px, 18vw, 250px)",
        height: compact ? "clamp(170px, 16vw, 230px)" : "clamp(180px, 18vw, 250px)",
      }}
    >
      <div className="timer-orb-glow absolute inset-0 rounded-full" style={{ "--glow-color": modeColor } as CSSProperties} />
      <div className="timer-orb-shell absolute inset-[3%] rounded-full" />
      <div
        className="timer-orb-progress absolute inset-[6%] rounded-full"
        style={{
          background: `conic-gradient(from 220deg, ${modeColor} 0deg, color-mix(in oklch, ${modeColor} 80%, white) ${progressDegrees * 0.55}deg, color-mix(in oklch, ${modeColor} 60%, black) ${progressDegrees}deg, transparent ${progressDegrees}deg 360deg)`,
        }}
      />
      <div className="timer-orb-core absolute inset-[18%] rounded-full overflow-hidden">
        <div className={`timer-orb-wave [transition:all_1200ms_cubic-bezier(0.34,1.56,0.64,1)]`} style={{ top: `${waveLevel}%`, "--wave-color": modeColor } as CSSProperties}>
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <div className={`font-mono tabular-nums ${compact ? "text-[32px] md:text-[36px]" : "text-[38px] md:text-[42px]"} font-bold leading-none tracking-wider text-[var(--foreground)] drop-shadow-[0_0_10px_color-mix(in_oklch,var(--background)_80%,transparent)]`}>
          {formatSeconds(seconds)}
        </div>
        <div className={`mt-2 text-xs font-medium text-[var(--muted-foreground)]`}>
          {isFinished ? "已完成" : paused && progress > 0 ? "已暂停" : isRunning ? "专注中" : "等待开始"}
        </div>
      </div>
    </div>
  );
}

export default App;
