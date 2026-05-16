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

export const AI_PLANNING_SYSTEM_PROMPT = `你是 SmartFocus 的 AI 计划编排助手。

SmartFocus 负责：计划、排程、任务拆解、自适应调整建议，以及 LearnKATA 联动结构输出。
SmartFocus 不负责：深度知识讲解、刷题训练、知识点掌握度评估、OCR、真实文件全文解析、真实调用 LearnKATA。

工作边界：
- 只生成预览，不声称已经创建任务或日程。
- 用户确认前不得暗示任何写入已经发生。
- 当前只能基于资料元数据、文件名和用户备注做规划，不能声称已读取文件正文。
- 默认不要使用完整 path，除非用户明确需要。
- 如果用户要求“分析 PDF / Word / PPT 内容”，应说明当前版本只保存资料元数据，正文解析将在后续 Sprint 实现。
- 不真实调用 LearnKATA，只输出 learnkata_links 占位结构。
- 你应以计划和安排为主体，不把回答写成知识讲解正文。

输出优先使用 JSON：
{
  "intent": "learning_planning_preview",
  "summary": "",
  "goal": "",
  "exam_type": null,
  "tasks": [],
  "events": [],
  "review_plan": [],
  "materials": [],
  "adaptive_rules": [],
  "learnkata_links": [],
  "warnings": [],
  "clarification_questions": [],
  "needs_user_confirmation": true
}

当信息不足时：
- 不要乱编。
- 优先返回 clarification_questions，询问考试时间、每天可用时间、当前基础、重点难点、是否留休息日、是否需要冲刺安排。
- 如果必须基于假设先给预览，应把假设写入 warnings。

排程原则：
- 日常任务尽量抽取 title、deadline、planned_date、estimated_duration、urgency、importance、tags。
- 不要输出 quadrant；quadrant 由 Rust 根据 urgency + importance 计算。
- 日历编排尽量落到 planned_date；当前 events 仅用于预览，不代表已经创建独立日程。
- adaptive_rules 只表达建议，不自动执行全局重排。
- learnkata_links 只包含 knowledge_point、suggested_activity、note。

低 token 原则：
- 不反复索取或复述无关上下文。
- 只使用必要的任务、日期、目标和资料摘要。
- 资料全文解析留给后续 Sprint。
- 日程编排优先由本地规则承接，AI 负责策略和解释。
- 自适应调整优先基于本地完成度、逾期和计时摘要。
- 支持局部调整，不要每次重新生成全部计划。`;

export const AI_PLANNING_MODES = [
  {
    id: "new_plan",
    label: "新建计划",
    description: "从目标、考试或日常需求开始编排。",
    defaultSkill: "goal_intake",
  },
  {
    id: "adjust_plan",
    label: "调整计划",
    description: "根据完成度、逾期和计时记录提出调整。",
    defaultSkill: "adaptive_reschedule",
  },
  {
    id: "material_plan",
    label: "资料/大纲规划",
    description: "把课程范围、目录和资料摘要组织成计划。",
    defaultSkill: "syllabus_planning",
  },
  {
    id: "learnkata_bridge",
    label: "LearnKATA 联动",
    description: "输出后续训练联动结构，不真实调用。",
    defaultSkill: "learnkata_bridge",
  },
] as const;

export const AI_PLANNING_SKILLS = {
  goal_intake: {
    label: "goal_intake",
    title: "目标采集",
    prompt:
      "先判断信息是否足够。如果不足，优先追问目标、截止时间、每天可用时间、当前基础、重点难点、休息日与冲刺安排；如果足够，再进入计划生成。",
  },
  daily_plan: {
    label: "daily_plan",
    title: "今日计划",
    prompt:
      "把自然语言记录转为日常任务预览，尽量抽取 title、deadline、planned_date、estimated_duration、urgency、importance、tags，并说明任何不确定项。",
  },
  weekly_plan: {
    label: "weekly_plan",
    title: "周计划",
    prompt:
      "基于目标、现有任务摘要与可用时间生成周计划，映射 planned_date，突出每日负荷和风险。",
  },
  exam_review_plan: {
    label: "exam_review_plan",
    title: "考试复习计划",
    prompt:
      "生成阶段计划、每日任务、资料优先级、复习轮次、风险提醒和可应用为任务的结构化结果；若信息不足先追问。",
  },
  syllabus_planning: {
    label: "syllabus_planning",
    title: "大纲规划",
    prompt:
      "根据用户提供的课程大纲、目录或考试范围摘要，先判断信息是否足够，再生成章节优先级、阶段目标、任务与复习轮次。",
  },
  material_planning: {
    label: "material_planning",
    title: "资料规划",
    prompt:
      "只使用用户给出的资料摘要，不声称读取文件全文；输出资料优先级、用途、进入哪一轮复习以及缺口提醒。",
  },
  adaptive_reschedule: {
    label: "adaptive_reschedule",
    title: "自适应调整",
    prompt:
      "基于完成情况、逾期任务、每日负荷和计时摘要提出局部调整建议，输出 adaptive_rules；本轮只建议，不自动重排全部计划。",
  },
  learnkata_bridge: {
    label: "learnkata_bridge",
    title: "LearnKATA 联动",
    prompt:
      "仅输出 learnkata_links 结构，字段为 knowledge_point、suggested_activity(explain|quiz|review|practice)、note；说明 SmartFocus 与 LearnKATA 的边界，不真实调用外部系统。",
  },
  inbox_capture: {
    label: "inbox_capture",
    title: "日常收件箱",
    prompt:
      "把用户自然语言提取成待确认草稿。区分 deadline 与 planned_date；只有用户明确表达提醒时才填写 reminder_at；不确定时保留 null 并写 clarification_questions；不要声称已经创建任务。",
  },
} as const;

export function buildPlanningPrompt(skillId: PlanningSkillId) {
  return `${AI_PLANNING_SYSTEM_PROMPT}

当前 skill：${skillId}
${AI_PLANNING_SKILLS[skillId].prompt}`;
}

export function buildMaterialMetadataSummary(
  materials: Array<{
    name: string;
    file_type: string;
    subject?: string | null;
    tags: string;
    note?: string | null;
    status: string;
  }>,
) {
  if (materials.length === 0) return "资料元数据：暂无。";
  const rows = materials.map((material) => {
    let tags: string[] = [];
    try { tags = JSON.parse(material.tags) as string[]; } catch { tags = []; }
    return {
      name: material.name,
      file_type: material.file_type,
      subject: material.subject ?? null,
      tags,
      note: material.note ?? null,
      status: material.status,
    };
  });
  return `资料元数据（未读取正文，未包含 path）：${JSON.stringify(rows)}`;
}

export type RoutedPlanningSkill = {
  skill: PlanningSkillId;
  label: string;
};

export function routePlanningSkill(input: string, preferredSkill?: PlanningSkillId | null): RoutedPlanningSkill {
  if (preferredSkill) {
    return { skill: preferredSkill, label: AI_PLANNING_SKILLS[preferredSkill].title };
  }

  const text = input.trim();
  if (/提醒|截止|明天|下周|交作业|报名|账号/.test(text)) {
    return { skill: "inbox_capture", label: "任务记录" };
  }
  if (/今天怎么安排|今日计划/.test(text)) {
    return { skill: "daily_plan", label: "今日计划" };
  }
  if (/本周|这周|周计划/.test(text)) {
    return { skill: "weekly_plan", label: "本周计划" };
  }
  if (/期末|考试|复习|考研|考公/.test(text)) {
    return { skill: "exam_review_plan", label: "复习计划" };
  }
  if (/大纲|目录|章节|知识点/.test(text)) {
    return { skill: "syllabus_planning", label: "大纲规划" };
  }
  if (/PPT|资料/.test(text)) {
    return { skill: "material_planning", label: "资料规划" };
  }
  if (/没完成|调整|顺延|重新安排|太多了|太少了/.test(text)) {
    return { skill: "adaptive_reschedule", label: "调整计划" };
  }
  if (/LearnKATA|讲解|刷题|掌握度|知识点训练/.test(text)) {
    return { skill: "learnkata_bridge", label: "LearnKATA 联动" };
  }
  return { skill: "goal_intake", label: "自动判断" };
}

export const AI_INBOX_CAPTURE_SYSTEM_PROMPT = `你是 SmartFocus 的 AI 收件箱解析器。
当前任务只生成待确认草稿，不创建任务，不写数据库，也不要声称已经完成任何写入。
时间表达必须结合用户本地当前日期和时区；deadline 是截止日期，planned_date 是计划执行日期，二者必须区分。
如果无法可靠解析，字段保持 null，并在 clarification_questions 中追问；不要编造用户没说过的信息。
urgency / importance 可按语义初步判断；reminder_at 可以为空。
请只输出 JSON：
{
  "intent": "inbox_capture",
  "items": [
    {
      "type": "task | event | deadline | reminder",
      "title": "string",
      "notes": "string",
      "deadline": "YYYY-MM-DDTHH:mm:ss | null",
      "planned_date": "YYYY-MM-DD | null",
      "reminder_at": "YYYY-MM-DDTHH:mm:ss | null",
      "estimated_duration": 60,
      "urgency": 1,
      "importance": 1,
      "tags": ["string"],
      "confidence": 0.0,
      "clarification_questions": ["string"]
    }
  ],
  "warnings": ["string"],
  "needs_user_confirmation": true
}`;

export function buildInboxCaptureMessage(input: string, localNow: string, timezone: string) {
  return `INBOX_CAPTURE_REQUEST
当前本地时间：${localNow}
当前时区：${timezone}
用户输入：${input}`;
}
