export type PlanningModeId = "new_plan" | "adjust_plan" | "material_plan" | "learnkata_bridge";

export type PlanningSkillId =
  | "goal_intake"
  | "daily_plan"
  | "weekly_plan"
  | "exam_review_plan"
  | "syllabus_planning"
  | "material_planning"
  | "adaptive_reschedule"
  | "learnkata_bridge"
  | "inbox_capture";

export type InboxCaptureItem = {
  type: "task" | "event" | "deadline" | "reminder";
  title: string;
  notes: string;
  deadline: string | null;
  planned_date: string | null;
  reminder_at: string | null;
  estimated_duration: number | null;
  urgency: 0 | 1;
  importance: 0 | 1;
  tags: string[];
  confidence: number;
  clarification_questions: string[];
};

export type InboxCapturePreview = {
  intent: "inbox_capture";
  items: InboxCaptureItem[];
  warnings: string[];
  needs_user_confirmation: true;
};

export type AdaptiveRescheduleSuggestionType =
  | "move_task"
  | "estimate_duration"
  | "mark_needs_review"
  | "split_task"
  | "keep";

export type AdaptiveReschedulePreview = {
  intent: "adaptive_reschedule";
  summary: string;
  reason: string;
  clarification_questions?: string[];
  reschedule_scope: {
    mode: "partial";
    date_range: [string, string];
    affected_task_count: number;
    strategy: "delay" | "compress" | "redistribute" | "reduce_low_priority" | "review_first";
  };
  suggestions: Array<{
    type: AdaptiveRescheduleSuggestionType;
    task_id: string;
    task_title: string;
    current_planned_date: string | null;
    suggested_planned_date: string | null;
    current_estimated_duration: number | null;
    suggested_estimated_duration: number | null;
    add_tags: string[];
    reason: string;
    risk: "low" | "medium" | "high";
  }>;
  daily_load_after: Array<{
    date: string;
    estimated_minutes: number;
    task_count: number;
    overload: boolean;
  }>;
  warnings: string[];
  needs_user_confirmation: true;
};

export const AI_PLANNING_SYSTEM_PROMPT = `你是 SmartFocus 的 AI 计划编排助手。

SmartFocus 负责：计划、排程、任务拆解、自适应调整建议，以及 LearnKATA 联动结构输出。
SmartFocus 不负责：深度知识讲解、刷题训练、知识点掌握度评估、OCR、真实文件全文解析、真实调用 LearnKATA。

工作边界：
- 只生成预览，不声称已经创建任务或日程。
- 用户确认前不得暗示任何写入已经发生。
- 当前只能基于用户输入、资料元数据、资料摘要和现有任务摘要做规划，不能声称已读取 PDF / Word / PPT 正文。
- 默认不要使用完整 path，除非用户明确需要。
- 如果用户要求“分析 PDF / Word / PPT 内容”，应说明当前版本只保存资料元数据，正文解析将在后续 Sprint 实现。
- 不真实调用 LearnKATA，只输出 learnkata_links 占位结构。
- 以计划和安排为主体，不把回答写成知识讲解正文。

请只返回 JSON：
{
  "intent": "learning_planning_preview",
  "summary": "",
  "goal": {
    "title": "",
    "subject": "",
    "exam_type": null,
    "deadline": null,
    "daily_available_minutes": null,
    "rest_days": [],
    "current_level": null
  },
  "clarification_questions": [],
  "chapters": [],
  "daily_plan": [],
  "plan_scope": "full_plan",
  "review_rounds": [],
  "adaptive_rules": [],
  "learnkata_links": [],
  "warnings": [],
  "needs_user_confirmation": true
}

信息不足时：
- 不要乱编完整计划。
- 优先返回 clarification_questions，至少核对考试日期、每天可用时间、科目、考试类型、休息日、当前基础、大纲/范围。
- 如果基于假设给临时草案，必须把假设写入 warnings。

结构要求：
- chapters 包含 title、knowledge_points、difficulty(low|medium|hard)、priority(low|medium|high)、estimated_minutes、reason。
- daily_plan 包含 date、title、tasks、total_minutes、note。
- daily_plan.tasks 包含 title、planned_date、estimated_duration、urgency(urgent|not_urgent 或 high|medium|low)、importance(important|not_important 或 high|medium|low)、tags、notes。
- review_rounds 包含 name、goal、date_range。
- adaptive_rules 只表达建议，不自动执行全局重排。
- learnkata_links 仅包含 knowledge_point、suggested_activity(explain|quiz|review|practice)、note。

plan_scope values: full_plan | first_week_only | needs_continue.
If information is sufficient, daily_plan must cover the full revision period before the exam and every chapter must appear in at least one task.
If only a partial plan is returned, use a non-full plan_scope and add a warning that the plan is partial and does not cover everything.
- 不要输出 quadrant；quadrant 由 Rust 根据 urgency + importance 计算。

低 token 原则：
- 后续规划优先使用 summary、chapters 和必要任务摘要，不反复发送完整原始大纲。
- 只有用户要求重新整理大纲时，才重新使用原始文本。
- 不传完整本地 path，不传文件正文。`;

export const AI_PLANNING_MODES = [
  { id: "new_plan", label: "新建计划", description: "从目标、考试或日常需求开始编排。", defaultSkill: "goal_intake" },
  { id: "adjust_plan", label: "调整计划", description: "根据完成度、逾期和计时记录提出调整。", defaultSkill: "adaptive_reschedule" },
  { id: "material_plan", label: "资料/大纲规划", description: "把课程范围、目录和资料摘要组织成计划。", defaultSkill: "syllabus_planning" },
  { id: "learnkata_bridge", label: "LearnKATA 联动", description: "输出后续训练联动结构，不真实调用。", defaultSkill: "learnkata_bridge" },
] as const;

export const AI_PLANNING_SKILLS = {
  goal_intake: { label: "goal_intake", title: "目标采集", prompt: "先判断信息是否足够；不足时优先追问，再决定是否进入学习计划生成。" },
  daily_plan: { label: "daily_plan", title: "今日计划", prompt: "把自然语言记录转为日常任务预览，区分 deadline 与 planned_date，并说明不确定项。" },
  weekly_plan: { label: "weekly_plan", title: "周计划", prompt: "基于目标、现有任务摘要与可用时间生成周计划，突出每日负荷与风险。" },
  exam_review_plan: { label: "exam_review_plan", title: "考试复习计划", prompt: "生成章节拆解、复习轮次、每日安排和可创建任务；信息不足时先追问。" },
  syllabus_planning: { label: "syllabus_planning", title: "大纲规划", prompt: "根据用户提供的大纲、目录或考试范围先判断是否足够，再生成章节优先级和每日学习项目计划。" },
  material_planning: { label: "material_planning", title: "资料规划", prompt: "只使用资料元数据与摘要，不声称读取文件正文；输出资料如何进入复习轮次。" },
  adaptive_reschedule: { label: "adaptive_reschedule", title: "自适应调整", prompt: "基于完成情况、逾期任务、每日负荷和计时摘要提出局部调整建议，只输出规则，不自动全局重排。" },
  learnkata_bridge: { label: "learnkata_bridge", title: "LearnKATA 联动", prompt: "仅输出 learnkata_links，占位说明未来讲解、练习、测验联动，不真实调用外部系统。" },
  inbox_capture: { label: "inbox_capture", title: "日常收件箱", prompt: "把用户自然语言提取成待确认草稿；不确定时保留 null 并写 clarification_questions。" },
} as const;

export function buildPlanningPrompt(skillId: PlanningSkillId) {
  return `${AI_PLANNING_SYSTEM_PROMPT}

当前 skill：${skillId}
${AI_PLANNING_SKILLS[skillId].prompt}`;
}


export function buildAdaptiveReschedulePrompt() {
  return `${AI_PLANNING_SYSTEM_PROMPT}

?? skill?adaptive_reschedule
??????????????????????????????
??? JSON?
{
  "intent": "adaptive_reschedule",
  "summary": "",
  "reason": "",
  "clarification_questions": [],
  "reschedule_scope": { "mode": "partial", "date_range": ["YYYY-MM-DD", "YYYY-MM-DD"], "affected_task_count": 0, "strategy": "delay | compress | redistribute | reduce_low_priority | review_first" },
  "suggestions": [{ "type": "move_task | estimate_duration | mark_needs_review | split_task | keep", "task_id": "", "task_title": "", "current_planned_date": "YYYY-MM-DD", "suggested_planned_date": "YYYY-MM-DD", "current_estimated_duration": 60, "suggested_estimated_duration": 45, "add_tags": ["???"], "reason": "", "risk": "low | medium | high" }],
  "daily_load_after": [{ "date": "YYYY-MM-DD", "estimated_minutes": 120, "task_count": 3, "overload": false }],
  "warnings": [],
  "needs_user_confirmation": true
}
???
- ??????????????????????
- ???????????? quadrant??? deadline / urgency / importance?
- ???????? clarification_questions??????
- split_task ??????????????keep ?????????
- ?????????? token context??????????`;
}

export function buildAdaptiveRescheduleContext(
  tasks: Array<{ id: string; title: string; planned_date?: string | null; deadline?: string | null; estimated_duration?: number | null; urgency: string; importance: string; tags: string; status: string; updated_at: string; actual_total_duration?: number | null }>,
  records: Array<{ task_id?: string | null; mode: string; duration: number; started_at: string; ended_at: string }>,
  userInput: string,
  nowIso = new Date().toISOString(),
) {
  const now = new Date(nowIso);
  const recent7 = new Date(now); recent7.setDate(now.getDate() - 7);
  const recent14 = new Date(now); recent14.setDate(now.getDate() - 14);
  const unfinished = tasks.filter((task) => task.status !== "done" && task.status !== "archived").map((task) => ({ id: task.id, title: task.title, planned_date: task.planned_date ?? null, deadline: task.deadline ?? null, estimated_duration: task.estimated_duration ?? null, urgency: task.urgency, importance: task.importance, tags: safeParseTags(task.tags), completed: false }));
  const recentlyCompleted = tasks.filter((task) => task.status === "done" && new Date(task.updated_at) >= recent7).map((task) => ({ title: task.title, completed_at: task.updated_at, actual_total_duration: task.actual_total_duration ?? null }));
  const recentRecords = records.filter((record) => new Date(record.started_at) >= recent14).map((record) => ({ task_id: record.task_id ?? null, mode: record.mode, duration_seconds: Math.round(record.duration * 60), started_at: record.started_at, ended_at: record.ended_at }));
  const byDate = new Map<string, { planned_task_count: number; estimated_minutes: number; unfinished_count: number; overdue_count: number }>();
  for (const task of unfinished) {
    const date = task.planned_date?.slice(0, 10); if (!date) continue;
    const row = byDate.get(date) ?? { planned_task_count: 0, estimated_minutes: 0, unfinished_count: 0, overdue_count: 0 };
    row.planned_task_count += 1; row.estimated_minutes += task.estimated_duration ?? 0; row.unfinished_count += 1; if (date < nowIso.slice(0, 10)) row.overdue_count += 1; byDate.set(date, row);
  }
  return `RESCHEDULE_CONTEXT
${JSON.stringify({ current_unfinished_tasks: unfinished, recent_completed_tasks: recentlyCompleted, recent_timer_records: recentRecords, daily_load_summary: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, load]) => ({ date, ...load })), user_input: userInput })}`;
}

function safeParseTags(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map((item) => `${item}`) : []; }
  catch { return []; }
}

export function buildMaterialMetadataSummary(materials: Array<{ name: string; file_type: string; subject?: string | null; exam_type?: string | null; tags: string; note?: string | null; status: string }>) {
  if (materials.length === 0) return "资料摘要：暂无。";
  const rows = materials.map((material) => {
    let tags: string[] = [];
    try { tags = JSON.parse(material.tags) as string[]; } catch { tags = []; }
    return {
      name: material.name,
      file_type: material.file_type,
      subject: material.subject ?? null,
      exam_type: material.exam_type ?? null,
      tags,
      summary: material.note ?? null,
      status: material.status,
    };
  });
  return `资料摘要（未读取正文，未包含 path）：${JSON.stringify(rows)}`;
}

export function buildTaskLoadSummary(tasks: Array<{ title: string; planned_date?: string | null; deadline?: string | null; estimated_duration?: number | null; status: string }>) {
  const rows = tasks
    .filter((task) => task.status !== "done")
    .slice(0, 20)
    .map((task) => ({
      title: task.title,
      planned_date: task.planned_date ?? null,
      deadline: task.deadline ?? null,
      estimated_duration: task.estimated_duration ?? null,
    }));
  return `现有任务摘要：${JSON.stringify(rows)}`;
}

export type RoutedPlanningSkill = { skill: PlanningSkillId; label: string };

export function routePlanningSkill(input: string, preferredSkill?: PlanningSkillId | null): RoutedPlanningSkill {
  if (preferredSkill) return { skill: preferredSkill, label: AI_PLANNING_SKILLS[preferredSkill].title };
  const text = input.trim();
  if (/提醒|截止|明天|下周|交作业|报名|账号/.test(text)) return { skill: "inbox_capture", label: "任务记录" };
  if (/今天怎么安排|今日计划/.test(text)) return { skill: "daily_plan", label: "今日计划" };
  if (/本周|这周|周计划/.test(text)) return { skill: "weekly_plan", label: "本周计划" };
  if (/期末|考试|复习|考研|考公/.test(text)) return { skill: "exam_review_plan", label: "复习计划" };
  if (/大纲|目录|章节|知识点|考试范围/.test(text)) return { skill: "syllabus_planning", label: "大纲规划" };
  if (/PPT|资料/.test(text)) return { skill: "material_planning", label: "资料规划" };
  if (/没完成|调整|顺延|重新安排|太多了|太少了/.test(text)) return { skill: "adaptive_reschedule", label: "调整计划" };
  if (/LearnKATA|讲解|刷题|掌握度|知识点训练/.test(text)) return { skill: "learnkata_bridge", label: "LearnKATA 联动" };
  return { skill: "goal_intake", label: "自动判断" };
}

export const AI_INBOX_CAPTURE_SYSTEM_PROMPT = `你是 SmartFocus 的 AI 收件箱解析器。只生成待确认草稿，不创建任务，不写数据库，也不要声称已经完成任何写入。`;

export function buildInboxCaptureMessage(input: string, localNow: string, timezone: string) {
  return `INBOX_CAPTURE_REQUEST
当前本地时间：${localNow}
当前时区：${timezone}
用户输入：${input}`;
}
