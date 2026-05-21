/**
 * SmartFocus Intent Router — Sprint 20C
 * Deterministic frontend intent classification with date semantics.
 * Supplements (not replaces) the backend AI response intents.
 */

import type { Task, PendingAction } from "./types";
import { filterTasksByDate, type RiskLevel } from "./aiTools";

// ---------- Intent types ----------

export type SmartFocusIntent =
  | "chat"
  | "create_task"
  | "delete_tasks"
  | "move_tasks_to_trash"
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

// ---------- Date helpers ----------

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

// ---------- Date expression extraction ----------

interface DateExpression {
  date: string;
  operator: "eq" | "gte" | "lte";
  label: string;
  fieldHint: "planned_or_deadline" | "created_at";
}

function extractDateExpressions(text: string): DateExpression[] {
  const expressions: DateExpression[] = [];
  const today = localDateKey();
  const yesterday = dateOffset(-1);
  const tomorrow = dateOffset(1);

  // Explicit created_at expressions: "昨天创建/添加/录入的任务"
  if (/昨天\s*(创建|添加|录入|新建)/.test(text)) {
    expressions.push({ date: yesterday, operator: "eq", label: "昨天创建", fieldHint: "created_at" });
    return expressions;
  }
  if (/今天\s*(创建|添加|录入|新建)/.test(text)) {
    expressions.push({ date: today, operator: "eq", label: "今天创建", fieldHint: "created_at" });
    return expressions;
  }

  // "昨天及以前" = planned_date <= yesterday
  if (/昨天.*(及|以|之)前|昨天.*以前/.test(text)) {
    expressions.push({ date: yesterday, operator: "lte", label: "昨天及以前", fieldHint: "planned_or_deadline" });
    return expressions;
  }

  // "明天及以后" / "明天以后" / "从明天开始" = planned_date >= tomorrow
  if (/明天.*(及|以|之)(后|往)|明天.*以后|从.*明天.*(起|开始)|明天.*往后/.test(text)) {
    expressions.push({ date: tomorrow, operator: "gte", label: "明天及以后", fieldHint: "planned_or_deadline" });
    return expressions;
  }

  // "今天及以后" / "从今天往后" = planned_date >= today
  if (/今天.*(及|以|之)(后|往)|今天.*以后|从.*今天.*(起|开始)|今天.*往后/.test(text)) {
    expressions.push({ date: today, operator: "gte", label: "今天及以后", fieldHint: "planned_or_deadline" });
    return expressions;
  }

  // "后天及以后"
  if (/后天.*(及|以|之)(后|往)|后天.*以后/.test(text)) {
    expressions.push({ date: dateOffset(2), operator: "gte", label: "后天及以后", fieldHint: "planned_or_deadline" });
    return expressions;
  }

  // Simple date references: "昨天的任务" / "昨天任务"
  if (/昨天/.test(text)) {
    expressions.push({ date: yesterday, operator: "eq", label: "昨天", fieldHint: "planned_or_deadline" });
    return expressions;
  }
  if (/今天/.test(text)) {
    expressions.push({ date: today, operator: "eq", label: "今天", fieldHint: "planned_or_deadline" });
    return expressions;
  }
  if (/明天/.test(text)) {
    expressions.push({ date: tomorrow, operator: "eq", label: "明天", fieldHint: "planned_or_deadline" });
    return expressions;
  }

  // Explicit date: "5月20日" / "5月20号"
  const explicitDate = text.match(/(\d{1,2})月(\d{1,2})[号日]/);
  if (explicitDate) {
    const year = new Date().getFullYear();
    const month = String(Number(explicitDate[1])).padStart(2, "0");
    const day = String(Number(explicitDate[2])).padStart(2, "0");
    expressions.push({ date: `${year}-${month}-${day}`, operator: "eq", label: `${explicitDate[1]}月${explicitDate[2]}日`, fieldHint: "planned_or_deadline" });
    return expressions;
  }

  return expressions;
}

// ---------- Intent classification patterns ----------

const DELETE_PATTERNS = /删除|清除|移除|删掉|清空|一键删除|批量删除/;
const TASK_ENTITY_PATTERNS = /任务|计划|待办|安排|事项|东西|所有/;
const CREATE_TASK_PATTERNS = /明天提醒我|帮我记|创建任务|记一下|帮我创建|新建任务|加一个任务|添加任务/;
const REMINDER_PATTERNS = /提醒我|设个提醒|提醒一下|闹钟/;
const TIMER_START_PATTERNS = /开始计时|启动计时|开始专注|番茄钟|专注一下|计时开始/;
const TIMER_STOP_PATTERNS = /停止计时|结束计时|暂停计时|停止专注/;
const PLANNING_PATTERNS = /复习计划|考试|大纲|每天学|学习计划|考研|考公|备考|课程学习|资料整理/;
const ADAPTIVE_PATTERNS = /没完成|顺延|调整|重排|太满|太多|重新安排|延期|延期到/;
const GREETING_PATTERNS = /^(你好|您好|嗨|哈喽|在吗|早上好|下午好|晚上好|hi|hello|hey)[\s!！。,.，？?]*$/i;

// ---------- Main intent router ----------

export function routeSmartFocusIntent(
  input: string,
  context: { tasks: Task[] },
): IntentResult {
  const text = input.trim();
  if (!text) {
    return { intent: "chat", confidence: 1, params: {}, missingFields: [], riskLevel: "low", needsClarification: false };
  }

  // 1. Greeting — highest priority, low risk
  if (GREETING_PATTERNS.test(text)) {
    return { intent: "chat", confidence: 0.95, params: {}, missingFields: [], riskLevel: "low", needsClarification: false };
  }

  const hasDelete = DELETE_PATTERNS.test(text);
  const hasTaskEntity = TASK_ENTITY_PATTERNS.test(text);
  const dateExprs = extractDateExpressions(text);

  // 2. Delete intents
  if (hasDelete) {
    if (!hasTaskEntity && dateExprs.length === 0) {
      // Delete but unclear what — ask
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.4,
        params: {},
        missingFields: ["target"],
        riskLevel: "high",
        needsClarification: true,
        clarificationQuestion: '请说明要删除哪些任务，比如"昨天的任务"或"所有未完成任务"。',
      };
    }

    // Has date expression with lte — "昨天及以前" pattern
    if (dateExprs.length > 0 && dateExprs[0].operator === "lte") {
      const de = dateExprs[0];
      // If fieldHint is "planned_or_deadline" but user hasn't specified — check if we need to ask
      const params: Record<string, unknown> = {
        dateMode: de.fieldHint,
        dateOperator: de.operator,
        targetDate: de.date,
        dateLabel: de.label,
        reason: `delete_${de.label}`,
      };
      const matched = filterTasksByDate(context.tasks, de.fieldHint, de.operator, de.date);
      params.matchedTaskIds = matched.map((t) => t.id);

      // If user said "昨天的任务" without "及以前", it means eq not lte
      // But if they said "昨天及以前", lte is correct
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.92,
        params,
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }

    // Has date expression with gte — "明天以后" pattern
    if (dateExprs.length > 0 && dateExprs[0].operator === "gte") {
      const de = dateExprs[0];
      const params: Record<string, unknown> = {
        dateMode: de.fieldHint,
        dateOperator: de.operator,
        targetDate: de.date,
        dateLabel: de.label,
        reason: `delete_${de.label}`,
      };
      const matched = filterTasksByDate(context.tasks, de.fieldHint, de.operator, de.date);
      params.matchedTaskIds = matched.map((t) => t.id);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.92,
        params,
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }

    // Has date expression with eq
    if (dateExprs.length > 0 && dateExprs[0].operator === "eq") {
      const de = dateExprs[0];
      const params: Record<string, unknown> = {
        dateMode: de.fieldHint,
        dateOperator: de.operator,
        targetDate: de.date,
        dateLabel: de.label,
        reason: `delete_${de.label}`,
      };
      const matched = filterTasksByDate(context.tasks, de.fieldHint, de.operator, de.date);
      params.matchedTaskIds = matched.map((t) => t.id);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.9,
        params,
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }

    // "删除所有未完成任务"
    if (/未完成/.test(text)) {
      const matched = context.tasks.filter((t) => t.status === "todo" && !t.trashed_at);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.95,
        params: { dateMode: "all", reason: "delete_all_incomplete", matchedTaskIds: matched.map((t) => t.id) },
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }

    // "删除所有任务"
    if (/(所有|全部)\s*(任务|计划|待办)/.test(text)) {
      const matched = context.tasks.filter((t) => t.status !== "archived" && !t.trashed_at);
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.95,
        params: { dateMode: "all", reason: "delete_all", matchedTaskIds: matched.map((t) => t.id) },
        missingFields: [],
        riskLevel: "high",
        needsClarification: false,
      };
    }

    // Generic delete with task entity but no date — need clarification
    if (hasTaskEntity && dateExprs.length === 0) {
      return {
        intent: "move_tasks_to_trash",
        confidence: 0.5,
        params: {},
        missingFields: ["date"],
        riskLevel: "high",
        needsClarification: true,
        clarificationQuestion: '请明确要删除哪些任务。比如"昨天的任务"、"昨天及以前的计划"、"明天以后的任务"或"所有未完成任务"。',
      };
    }

    // Fallback: has delete + task entity
    return {
      intent: "move_tasks_to_trash",
      confidence: 0.6,
      params: { raw: text },
      missingFields: [],
      riskLevel: "high",
      needsClarification: false,
    };
  }

  // 3. Create task
  if (CREATE_TASK_PATTERNS.test(text)) {
    return {
      intent: "create_task",
      confidence: 0.85,
      params: { raw: text },
      missingFields: [],
      riskLevel: "medium",
      needsClarification: false,
    };
  }

  // 4. Reminder
  if (REMINDER_PATTERNS.test(text) && !hasDelete) {
    return {
      intent: "create_reminder",
      confidence: 0.8,
      params: { raw: text },
      missingFields: [],
      riskLevel: "medium",
      needsClarification: false,
    };
  }

  // 5. Timer start
  if (TIMER_START_PATTERNS.test(text)) {
    return {
      intent: "start_timer",
      confidence: 0.85,
      params: { raw: text },
      missingFields: [],
      riskLevel: "low",
      needsClarification: false,
    };
  }

  // 6. Timer stop
  if (TIMER_STOP_PATTERNS.test(text)) {
    return {
      intent: "stop_timer",
      confidence: 0.85,
      params: {},
      missingFields: [],
      riskLevel: "low",
      needsClarification: false,
    };
  }

  // 7. Planning
  if (PLANNING_PATTERNS.test(text)) {
    return {
      intent: "planning",
      confidence: 0.8,
      params: { raw: text },
      missingFields: [],
      riskLevel: "low",
      needsClarification: false,
    };
  }

  // 8. Adaptive reschedule
  if (ADAPTIVE_PATTERNS.test(text)) {
    return {
      intent: "adaptive_reschedule",
      confidence: 0.8,
      params: { raw: text },
      missingFields: [],
      riskLevel: "low",
      needsClarification: false,
    };
  }

  // 9. Low confidence — could be chat or unrecognized intent
  return {
    intent: "unknown",
    confidence: 0.3,
    params: { raw: text },
    missingFields: [],
    riskLevel: "low",
    needsClarification: false,
  };
}

// ---------- PendingAction builder from intent ----------

export function buildPendingActionFromIntent(
  intentResult: IntentResult,
  tasks: Task[],
  source: "workbench" | "ai_workspace",
): PendingAction | null {
  if (intentResult.intent !== "move_tasks_to_trash") return null;
  if (intentResult.needsClarification) return null;

  const matchedIds = (intentResult.params.matchedTaskIds as string[]) ?? [];
  const matchedTasks = tasks.filter((t) => matchedIds.includes(t.id));
  const dateLabel = intentResult.params.dateLabel as string ?? "";
  const dateMode = intentResult.params.dateMode as string ?? "";
  const targetDate = intentResult.params.targetDate as string ?? "";

  // Build human-readable summary
  let summary: string;
  if (dateMode === "created_at" && intentResult.params.dateOperator === "eq") {
    summary = `将 ${dateLabel}创建的 ${matchedTasks.length} 个任务移动到回收站，可恢复。`;
  } else if (intentResult.params.dateOperator === "lte") {
    summary = `将 ${dateLabel}的 ${matchedTasks.length} 个任务移动到回收站，可恢复。`;
  } else if (intentResult.params.dateOperator === "gte") {
    summary = `将 ${dateLabel}的 ${matchedTasks.length} 个任务移动到回收站，可恢复。`;
  } else if (intentResult.params.reason === "delete_all_incomplete") {
    summary = `将 ${matchedTasks.length} 个未完成任务移动到回收站，可恢复。`;
  } else if (intentResult.params.reason === "delete_all") {
    summary = `将全部 ${matchedTasks.length} 个任务移动到回收站，可恢复。这是高风险操作。`;
  } else {
    summary = `将 ${matchedTasks.length} 个任务移动到回收站，可恢复。`;
  }

  return {
    id: crypto.randomUUID(),
    type: "batch_delete",
    params: {
      ...intentResult.params,
      reason: intentResult.params.reason ?? "intent_router_delete",
    },
    summary,
    affectedCount: matchedTasks.length,
    affectedPreview: matchedTasks.slice(0, 5).map((t) => t.title),
    taskIds: matchedIds,
    riskLevel: "high",
    source,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
}

// ---------- Confirm/cancel detection ----------

const CONFIRM_RE = /^(确认|是|执行|确认删除|继续|好|yes|ok|确定|执行吧|删吧|干吧|走|do|可以|对|没错|就这样|确认执行)$/;
const CANCEL_RE = /^(取消|不要|算了|不了|不执行|取消操作|cancel|no|不|停止|别删|先不做)$/;

export function isConfirmKeyword(text: string): boolean {
  return CONFIRM_RE.test(text.trim());
}

export function isCancelKeyword(text: string): boolean {
  return CANCEL_RE.test(text.trim());
}

// ---------- General chat detection ----------

export function isGeneralChatIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (/^(hi|hello|hey|你好|您好|嗨|哈喽|在吗|早上好|下午好|晚上好)[\s!！。,.，？?]*$/.test(normalized)) return true;
  if (/^(谢谢|多谢|辛苦了|好的|好|ok|嗯|收到|明白)[\s!！。,.，？?]*$/.test(normalized)) return true;
  if (/^(你是谁|你能做什么|怎么用|介绍一下|帮助|help)[\s!！。,.，？?]*$/.test(normalized)) return true;
  const planningIntent = /计划|安排|任务|提醒|截止|考试|复习|学习|大纲|目录|资料|没完成|调整|顺延|重新安排|番茄|计时|创建|记录|删除|清除/.test(normalized);
  return normalized.length <= 24 && !planningIntent;
}
