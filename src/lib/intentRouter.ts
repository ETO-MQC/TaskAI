import type { PendingAction, Task, StudyProject, TimerRecord } from "./types";
import { filterTasksByDate, type RiskLevel } from "./aiTools";
import { buildProjectReschedulePreview, buildStudyProjectContext, type StudyProjectRescheduleStrategy } from "./studyProjectReschedule";
import {
  extractTaskTitleQuery,
  formatAmbiguousMessage,
  formatNoMatchMessage,
  extractPlanQuery,
  normalizeTaskTitleQuery,
  resolveTaskCandidates,
  resolveStudyProject,
  resolveTasksByProject,
  type TaskResolveScope,
} from "./aiTaskResolver";

export type SmartFocusIntent =
  | "chat"
  | "create_task"
  | "delete_tasks"
  | "move_tasks_to_trash"
  | "shift_tasks_date"
  | "project_reschedule"
  | "mark_needs_review"
  | "update_tasks"
  | "create_reminder"
  | "start_timer"
  | "stop_timer"
  | "planning"
  | "adaptive_reschedule"
  | "unknown";

export interface IntentResult {
  intent: SmartFocusIntent;
  confidence: number;
  params: Record<string, unknown>;
  missingFields: string[];
  riskLevel: RiskLevel;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

type DateMode = "planned_or_deadline" | "created_at" | "today_view" | "all";
type DateOp = "eq" | "gte" | "lte";

interface DateExpression {
  date: string;
  operator: DateOp;
  label: string;
  fieldHint: DateMode;
}

function localDateKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function extractDateExpression(text: string): DateExpression | null {
  const today = localDateKey();
  const yesterday = dateOffset(-1);
  const tomorrow = dateOffset(1);

  if (/昨天\s*(创建|添加|录入|新建)/u.test(text)) {
    return { date: yesterday, operator: "eq", label: "昨天创建", fieldHint: "created_at" };
  }
  if (/今天\s*(创建|添加|录入|新建)/u.test(text)) {
    return { date: today, operator: "eq", label: "今天创建", fieldHint: "created_at" };
  }
  if (/(?:计划日期|planned_date)\s*(?:是|为|=|等于)\s*(?:今天|今日)/iu.test(text)) {
    return { date: today, operator: "eq", label: "计划日期今天", fieldHint: "planned_or_deadline" };
  }
  if (/昨天.*(?:及以前|之前|以前)|(?:昨天|昨日)以前/u.test(text)) {
    return { date: yesterday, operator: "lte", label: "昨天及以前", fieldHint: "planned_or_deadline" };
  }
  if (/明天.*(?:及以后|以后|之后|往后)|从\s*明天\s*(?:起|开始)/u.test(text)) {
    return { date: tomorrow, operator: "gte", label: "明天及以后", fieldHint: "planned_or_deadline" };
  }
  if (/今天.*(?:及以后|以后|之后|往后)|从\s*(?:今天|今日)\s*(?:起|开始)/u.test(text)) {
    return { date: today, operator: "gte", label: "今天及以后", fieldHint: "planned_or_deadline" };
  }
  if (/后天.*(?:及以后|以后|之后)/u.test(text)) {
    return { date: dateOffset(2), operator: "gte", label: "后天及以后", fieldHint: "planned_or_deadline" };
  }
  if (/昨天|昨日/u.test(text)) {
    return { date: yesterday, operator: "eq", label: "昨天", fieldHint: "planned_or_deadline" };
  }
  if (/今天|今日/u.test(text)) {
    return { date: today, operator: "eq", label: "今天", fieldHint: "today_view" };
  }
  if (/明天|明日/u.test(text)) {
    return { date: tomorrow, operator: "eq", label: "明天", fieldHint: "planned_or_deadline" };
  }

  const explicit = text.match(/(\d{1,2})月(\d{1,2})[日号]/u);
  if (explicit) {
    const year = new Date().getFullYear();
    return {
      date: `${year}-${String(Number(explicit[1])).padStart(2, "0")}-${String(Number(explicit[2])).padStart(2, "0")}`,
      operator: "eq",
      label: `${explicit[1]}月${explicit[2]}日`,
      fieldHint: "planned_or_deadline",
    };
  }
  return null;
}

function scopeFromDateExpression(dateExpr: DateExpression | null): TaskResolveScope {
  if (!dateExpr) return { mode: "global" };
  if (dateExpr.fieldHint === "today_view") return { mode: "today_view", date: dateExpr.date };
  if (dateExpr.label === "计划日期今天") return { mode: "planned_today", date: dateExpr.date };
  if (dateExpr.operator === "lte") return { mode: "before_today", date: dateExpr.date };
  if (dateExpr.label === "昨天") return { mode: "yesterday", date: dateExpr.date };
  return { mode: "global" };
}

function activeTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status === "todo" && !task.trashed_at);
}

function matchByDate(tasks: Task[], dateExpr: DateExpression) {
  return filterTasksByDate(tasks, dateExpr.fieldHint, dateExpr.operator, dateExpr.date).filter((task) => task.status === "todo");
}

function makeNoMatchResult(intent: SmartFocusIntent, query: string, suggestions: Task[], riskLevel: RiskLevel): IntentResult {
  return {
    intent,
    confidence: 0.9,
    params: { titleContains: query, resolverStatus: "no_match", matchedTaskIds: [] },
    missingFields: ["target"],
    riskLevel,
    needsClarification: true,
    clarificationQuestion: formatNoMatchMessage(query, suggestions),
  };
}

function makeAmbiguousResult(intent: SmartFocusIntent, query: string, candidates: Task[], riskLevel: RiskLevel, params: Record<string, unknown>): IntentResult {
  return {
    intent,
    confidence: 0.9,
    params: { ...params, titleContains: query, resolverStatus: "ambiguous", ambiguousTaskIds: candidates.map((task) => task.id), matchedTaskIds: [] },
    missingFields: ["target"],
    riskLevel,
    needsClarification: true,
    clarificationQuestion: formatAmbiguousMessage(query, candidates),
  };
}

function resolveTitleTarget(
  intent: "move_tasks_to_trash" | "shift_tasks_date" | "mark_needs_review",
  text: string,
  tasks: Task[],
  dateExpr: DateExpression | null,
  baseParams: Record<string, unknown>,
  riskLevel: RiskLevel,
): IntentResult | null {
  const rawQuery = extractTaskTitleQuery(text);
  if (!rawQuery) return null;

  const result = resolveTaskCandidates(tasks, rawQuery, scopeFromDateExpression(dateExpr));
  const params: Record<string, unknown> = { ...baseParams, titleContains: result.query };
  if (dateExpr) {
    params.dateMode = dateExpr.fieldHint;
    params.dateOperator = dateExpr.operator;
    params.targetDate = dateExpr.date;
    params.dateLabel = dateExpr.label;
  } else {
    params.dateMode = "all";
  }

  if (result.status === "no_match") return makeNoMatchResult(intent, result.query, result.suggestions, riskLevel);
  if (result.status === "ambiguous") return makeAmbiguousResult(intent, result.query, result.candidates, riskLevel, params);

  return {
    intent,
    confidence: 0.95,
    params: { ...params, matchedTaskIds: result.candidates.map((task) => task.id), resolverStatus: "matched" },
    missingFields: [],
    riskLevel,
    needsClarification: false,
  };
}

function extractShiftDays(text: string) {
  if (/两天|2\s*天/u.test(text)) return 2;
  if (/三天|3\s*天/u.test(text)) return 3;
  const match = text.match(/(\d+)\s*天/u);
  return match ? Math.max(1, Number(match[1])) : 1;
}

const DELETE_RE = /删除|删掉|移除|清除|清空|扔进回收站/u;
const SHIFT_RE = /推迟|顺延|往后推|往后延|延期|后移|改到明天/u;
const MARK_REVIEW_RE = /标记待整理|放待整理|待整理/u;
const CREATE_RE = /创建任务|新建任务|加一个任务|添加任务|记一个/u;
const REMINDER_RE = /提醒|闹钟/u;
const TIMER_START_RE = /开始计时|启动计时|开始专注|番茄钟/u;
const TIMER_STOP_RE = /停止计时|结束计时|暂停计时|停止专注/u;
const PLANNING_RE = /复习计划|考试|大纲|学习计划|考研|考公|课程学习|资料整理/u;
const ADAPTIVE_RE = /没完成|调整|重排|太满|太多|重新安排/u;
const GREETING_RE = /^(你好|您好|嗨|在吗|早上好|下午好|晚上好|hi|hello|hey)[\s!！。.?？]*$/iu;

const PROJECT_FEEDBACK_RE = /(没学|没完成|没做|暂停|先不学|不安排|往后推|整体顺延|顺延|压缩|重新排|重新安排|考试提前|每天最多|太赶|后面.*调整|调整.*计划)/u;
const PROJECT_GENERIC_RE = /(这个复习计划|这个学习计划|这个计划|后面帮我调整|后续计划|复习计划)/u;

function extractProjectDays(text: string) {
  if (/两天|二天/u.test(text)) return 2;
  if (/三天/u.test(text)) return 3;
  const match = text.match(/(\d+)\s*天/u);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function extractProjectDailyMinutes(text: string) {
  const match = text.match(/(?:每天最多|每日最多|每天不超过|每日不超过)\s*(\d+)\s*分钟/u);
  return match ? Math.max(1, Number(match[1])) : null;
}

function stripProjectQuery(text: string) {
  return text
    .replace(/我今天|今天|后面帮我调整一下|后面帮我调整|帮我|把|将|这个|复习计划|学习计划|计划|整体|往后推|顺延|暂停|这两天|两天|先不学|不安排|没学|没完成|没做|重新排一下|重新安排|压缩|考试提前了|每天最多\s*\d+\s*分钟|太赶了|但不能超过考试日期|后续/g, " ")
    .replace(/[，。！？,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProjectClarification(projects: StudyProject[]) {
  const active = projects.filter((project) => project.status !== "archived");
  return [
    `我找到了 ${active.length} 个学习项目：`,
    ...active.slice(0, 10).map((project, index) => `${index + 1}. ${project.name}`),
    "你要调整哪一个？",
  ].join("\n");
}

function routeProjectRescheduleIntent(text: string, context: { tasks: Task[]; studyProjects?: StudyProject[] }): IntentResult | null {
  if (!PROJECT_FEEDBACK_RE.test(text)) return null;
  const projects = (context.studyProjects ?? []).filter((project) => project.status !== "archived");
  if (projects.length === 0) return null;

  let strategy: StudyProjectRescheduleStrategy = "shift";
  if (/没学|没完成|没做/u.test(text) && /今天/u.test(text)) strategy = "missed_today";
  else if (/暂停|先不学|不安排/u.test(text)) strategy = "pause";
  else if (/压缩|重新排|重新安排|考试提前|每天最多|太赶/u.test(text)) strategy = "compress";
  else if (/往后推|整体顺延|顺延|推/u.test(text)) strategy = "shift";
  else if (/调整/u.test(text)) strategy = "redistribute";

  const mentionsKnownProject = projects.some((project) =>
    text.includes(project.name)
    || (!!project.subject && text.includes(project.subject))
    || (!!project.exam_type && text.includes(project.exam_type)),
  );
  if (PROJECT_GENERIC_RE.test(text) && !mentionsKnownProject) {
    return {
      intent: "project_reschedule",
      confidence: 0.85,
      params: { strategy, candidateProjectIds: projects.map((project) => project.id) },
      missingFields: ["studyProject"],
      riskLevel: "medium",
      needsClarification: true,
      clarificationQuestion: formatProjectClarification(projects),
    };
  }

  const query = stripProjectQuery(text) || extractPlanQuery(text) || text;
  const projectResult = resolveStudyProject(query, projects);
  if (projectResult.status === "ambiguous") {
    return {
      intent: "project_reschedule",
      confidence: 0.9,
      params: { strategy, ambiguousProjectIds: projectResult.candidates.map((project) => project.id) },
      missingFields: ["studyProject"],
      riskLevel: "medium",
      needsClarification: true,
      clarificationQuestion: formatProjectClarification(projectResult.candidates),
    };
  }
  if (projectResult.status === "no_match") return null;

  return {
    intent: "project_reschedule",
    confidence: 0.95,
    params: {
      strategy,
      studyProjectId: projectResult.project.id,
      studyProjectName: projectResult.project.name,
      shiftDays: extractProjectDays(text),
      pauseDays: extractProjectDays(text),
      dailyMinutes: extractProjectDailyMinutes(text),
      matchedTaskIds: context.tasks
        .filter((task) => task.study_project_id === projectResult.project.id && task.status !== "done" && task.status !== "archived" && !task.trashed_at && !!task.planned_date)
        .map((task) => task.id),
    },
    missingFields: [],
    riskLevel: "medium",
    needsClarification: false,
  };
}

export function routeSmartFocusIntent(input: string, context: { tasks: Task[]; studyProjects?: StudyProject[] }): IntentResult {
  const text = input.trim();
  if (!text) return { intent: "chat", confidence: 1, params: {}, missingFields: [], riskLevel: "low", needsClarification: false };
  if (GREETING_RE.test(text)) return { intent: "chat", confidence: 0.95, params: {}, missingFields: [], riskLevel: "low", needsClarification: false };

  const dateExpr = extractDateExpression(text);
  const projectReschedule = routeProjectRescheduleIntent(text, context);
  if (projectReschedule) return projectReschedule;

  if (SHIFT_RE.test(text)) {
    const shiftDays = extractShiftDays(text);
    // Try study project matching first
    const projects = context.studyProjects ?? [];
    if (projects.length > 0) {
      const planQuery = extractPlanQuery(text);
      if (planQuery) {
        const projResult = resolveStudyProject(planQuery, projects);
        if (projResult.status === "matched") {
          const projectTasks = resolveTasksByProject(context.tasks, projResult.project.id);
          if (projectTasks.length > 0) {
            return {
              intent: "shift_tasks_date",
              confidence: 0.95,
              params: { shiftDays, studyProjectId: projResult.project.id, studyProjectName: projResult.project.name, matchedTaskIds: projectTasks.map((t) => t.id) },
              missingFields: [],
              riskLevel: "medium",
              needsClarification: false,
            };
          }
          return {
            intent: "shift_tasks_date",
            confidence: 0.9,
            params: { shiftDays, studyProjectId: projResult.project.id, studyProjectName: projResult.project.name },
            missingFields: ["target"],
            riskLevel: "medium",
            needsClarification: true,
            clarificationQuestion: `学习项目「${projResult.project.name}」下没有未完成的可顺延任务。`,
          };
        }
        if (projResult.status === "ambiguous") {
          return {
            intent: "shift_tasks_date",
            confidence: 0.85,
            params: { shiftDays, ambiguousProjectIds: projResult.candidates.map((p) => p.id) },
            missingFields: ["target"],
            riskLevel: "medium",
            needsClarification: true,
            clarificationQuestion: `找到多个匹配的学习项目：\n${projResult.candidates.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}\n请指定要操作哪个项目。`,
          };
        }
      }
    }
    // Fallback to existing title-based matching
    const byTitle = resolveTitleTarget("shift_tasks_date", text, context.tasks, dateExpr, { shiftDays }, "medium");
    if (byTitle) return byTitle;
    if (!dateExpr) {
      return {
        intent: "shift_tasks_date",
        confidence: 0.55,
        params: { shiftDays },
        missingFields: ["target"],
        riskLevel: "medium",
        needsClarification: true,
        clarificationQuestion: "请说明要顺延哪一个任务，或给出任务名称。",
      };
    }
    const matched = matchByDate(context.tasks, dateExpr);
    return {
      intent: "shift_tasks_date",
      confidence: 0.88,
      params: { shiftDays, dateMode: dateExpr.fieldHint, dateOperator: dateExpr.operator, targetDate: dateExpr.date, dateLabel: dateExpr.label, matchedTaskIds: matched.map((task) => task.id) },
      missingFields: [],
      riskLevel: "medium",
      needsClarification: false,
    };
  }

  if (MARK_REVIEW_RE.test(text)) {
    const byTitle = resolveTitleTarget("mark_needs_review", text, context.tasks, dateExpr, {}, "low");
    if (byTitle) return byTitle;
  }

  if (DELETE_RE.test(text)) {
    const byTitle = resolveTitleTarget("move_tasks_to_trash", text, context.tasks, dateExpr, { reason: "intent_router_delete" }, "high");
    if (byTitle) return byTitle;

    if (/未完成/u.test(text)) {
      const matched = activeTasks(context.tasks);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.95,
        params: { dateMode: "all", reason: "delete_all_incomplete", matchedTaskIds: matched.map((task) => task.id) },
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }
    if (/全部|所有/u.test(text)) {
      const matched = activeTasks(context.tasks);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.95,
        params: { dateMode: "all", reason: "delete_all", matchedTaskIds: matched.map((task) => task.id) },
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }
    if (dateExpr) {
      const matched = matchByDate(context.tasks, dateExpr);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.9,
        params: { dateMode: dateExpr.fieldHint, dateOperator: dateExpr.operator, targetDate: dateExpr.date, dateLabel: dateExpr.label, reason: `delete_${dateExpr.label}`, matchedTaskIds: matched.map((task) => task.id) },
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }
    return {
      intent: "move_tasks_to_trash",
      confidence: 0.5,
      params: {},
      missingFields: ["target"],
      riskLevel: "high",
      needsClarification: true,
      clarificationQuestion: "请给出要删除的任务名称，或说明具体范围。",
    };
  }

  if (CREATE_RE.test(text)) return { intent: "create_task", confidence: 0.85, params: { raw: text }, missingFields: [], riskLevel: "medium", needsClarification: false };
  if (REMINDER_RE.test(text)) return { intent: "create_reminder", confidence: 0.8, params: { raw: text }, missingFields: [], riskLevel: "medium", needsClarification: false };
  if (TIMER_START_RE.test(text)) return { intent: "start_timer", confidence: 0.85, params: { raw: text }, missingFields: [], riskLevel: "low", needsClarification: false };
  if (TIMER_STOP_RE.test(text)) return { intent: "stop_timer", confidence: 0.85, params: {}, missingFields: [], riskLevel: "low", needsClarification: false };
  if (PLANNING_RE.test(text)) return { intent: "planning", confidence: 0.8, params: { raw: text }, missingFields: [], riskLevel: "low", needsClarification: false };
  if (ADAPTIVE_RE.test(text)) return { intent: "adaptive_reschedule", confidence: 0.8, params: { raw: text }, missingFields: [], riskLevel: "low", needsClarification: false };

  return { intent: "unknown", confidence: 0.3, params: { raw: text }, missingFields: [], riskLevel: "low", needsClarification: false };
}

export function buildPendingActionFromIntent(
  intentResult: IntentResult,
  tasks: Task[],
  source: "workbench" | "ai_workspace",
  projects: StudyProject[] = [],
  records: TimerRecord[] = [],
): PendingAction | null {
  if (intentResult.needsClarification) return null;

  if (intentResult.intent === "project_reschedule") {
    const projectId = intentResult.params.studyProjectId as string | undefined;
    if (!projectId) return null;
    const context = buildStudyProjectContext(projectId, projects, tasks, records);
    if (!context) return null;
    const preview = buildProjectReschedulePreview({
      context,
      strategy: (intentResult.params.strategy as StudyProjectRescheduleStrategy | undefined) ?? "shift",
      shiftDays: Number(intentResult.params.shiftDays) || 1,
      pauseDays: Number(intentResult.params.pauseDays) || 1,
      dailyMinutes: typeof intentResult.params.dailyMinutes === "number" ? intentResult.params.dailyMinutes : null,
    });
    if (preview.affectedTaskIds.length === 0) return null;
    return {
      id: crypto.randomUUID(),
      type: "project_reschedule",
      toolName: "project_reschedule",
      params: { ...intentResult.params, preview },
      summary: preview.summary,
      affectedCount: preview.affectedTaskIds.length,
      affectedPreview: preview.affectedPreview.slice(0, 5).map((item) => `${item.title}: ${item.old_planned_date ?? "未排期"} -> ${item.new_planned_date ?? "未排期"}`),
      projectReschedule: preview,
      taskIds: preview.affectedTaskIds,
      riskLevel: preview.riskLevel,
      source,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  const matchedIds = ((intentResult.params.matchedTaskIds as string[]) ?? []).filter(Boolean);
  if (matchedIds.length === 0) return null;

  const matchedTasks = tasks.filter((task) => matchedIds.includes(task.id));
  if (matchedTasks.length === 0) return null;

  const dateLabel = (intentResult.params.dateLabel as string | undefined) ?? "";
  const titleFilter = intentResult.params.titleContains as string | undefined;
  const titleDesc = titleFilter ? `名称为「${normalizeTaskTitleQuery(titleFilter)}」` : dateLabel || "指定范围";

  if (intentResult.intent === "shift_tasks_date") {
    const shiftDays = (intentResult.params.shiftDays as number | undefined) ?? 1;
    return {
      id: crypto.randomUUID(),
      type: "shift_tasks_date",
      toolName: "shift_tasks_date",
      params: { ...intentResult.params, shiftDays },
      summary: `将${titleDesc}的 ${matchedTasks.length} 个任务顺延 ${shiftDays} 天。`,
      affectedCount: matchedTasks.length,
      affectedPreview: matchedTasks.slice(0, 5).map((task) => task.title),
      taskIds: matchedIds,
      riskLevel: "medium",
      source,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  if (intentResult.intent === "mark_needs_review") {
    return {
      id: crypto.randomUUID(),
      type: "mark_needs_review",
      toolName: "mark_needs_review",
      params: intentResult.params,
      summary: `将${titleDesc}的 ${matchedTasks.length} 个任务标记为待整理。`,
      affectedCount: matchedTasks.length,
      affectedPreview: matchedTasks.slice(0, 5).map((task) => task.title),
      taskIds: matchedIds,
      riskLevel: "low",
      source,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  if (intentResult.intent !== "move_tasks_to_trash") return null;

  const summary = titleFilter
    ? `将${titleDesc}的 ${matchedTasks.length} 个任务移动到回收站，可恢复。`
    : `将 ${matchedTasks.length} 个任务移动到回收站，可恢复。`;
  return {
    id: crypto.randomUUID(),
    type: "batch_delete",
    params: { ...intentResult.params, reason: intentResult.params.reason ?? "intent_router_delete" },
    summary,
    affectedCount: matchedTasks.length,
    affectedPreview: matchedTasks.slice(0, 5).map((task) => task.title),
    taskIds: matchedIds,
    riskLevel: "high",
    source,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
}

const CONFIRM_RE = /^(确认|是|执行|确认删除|继续|好的|yes|ok|确定|执行吧|删吧|可以|对|没错|就这样|确认执行)$/iu;
const CANCEL_RE = /^(取消|不要|算了|不了|不执行|取消操作|cancel|no|不|停止|别删|先不做)$/iu;

export function isConfirmKeyword(text: string): boolean {
  return CONFIRM_RE.test(text.trim());
}

export function isCancelKeyword(text: string): boolean {
  return CANCEL_RE.test(text.trim());
}

export function isGeneralChatIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(hi|hello|hey|你好|您好|嗨|在吗|早上好|下午好|晚上好)[\s!！。.?？]*$/iu.test(normalized)) return true;
  if (/^(谢谢|多谢|辛苦了|好的|ok|收到|明白)[\s!！。.?？]*$/iu.test(normalized)) return true;
  const planningIntent = /计划|安排|任务|提醒|截止|考试|复习|学习|大纲|资料|调整|顺延|重新安排|番茄|计时|创建|记录|删除|清除/u.test(normalized);
  return normalized.length <= 24 && !planningIntent;
}
