import type { Task, StudyProject } from "./types";
import { filterTasksByDate, isInTodayView } from "./aiTools";

export type TaskResolveScope =
  | { mode: "global" }
  | { mode: "today_view"; date: string }
  | { mode: "planned_today"; date: string }
  | { mode: "yesterday"; date: string }
  | { mode: "before_today"; date: string };

export type TaskResolveResult =
  | { status: "matched"; query: string; candidates: Task[]; suggestions: Task[] }
  | { status: "ambiguous"; query: string; candidates: Task[]; suggestions: Task[] }
  | { status: "no_match"; query: string; candidates: Task[]; suggestions: Task[] };

const GENERIC_TITLE_WORDS = new Set([
  "任务",
  "计划",
  "待办",
  "事项",
  "一个任务",
  "这个任务",
  "今天",
  "今日",
  "明天",
  "昨天",
]);

function stripOuterQuotes(input: string) {
  return input.replace(/^[\s"'“”‘’「」『』《》]+|[\s"'“”‘’「」『』《》]+$/g, "");
}

export function normalizeTaskTitleQuery(input: string): string {
  let text = stripOuterQuotes(input)
    .replace(/[，。！？；、,.!?;]+$/g, "")
    .replace(/^\s*(?:名称|名字|标题|题目)\s*(?:是|为|叫|等于|包含)?\s*/u, "")
    .replace(/^\s*(?:叫|名叫)\s*/u, "")
    .replace(/^\s*(?:这个|那个|该|此)\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  const leadingAction = /^(?:删除|删掉|移除|清除|推迟|顺延|往后推|往后延|延期|后移|把|将)\s*/u;
  text = text.replace(leadingAction, "").trim();

  const suffixes = [
    /(?:这个|那个|该|此)?(?:任务|计划|待办|事项)$/u,
    /(?:这个|那个|该|此)(?:任务|计划|待办|事项)?$/u,
    /的(?:任务|计划|待办|事项)?$/u,
    /这(?:个)?(?:任务|计划|待办|事项)?$/u,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      const next = text.replace(suffix, "").trim();
      if (next && next !== text) {
        text = next;
        changed = true;
      }
    }
  }

  return stripOuterQuotes(text);
}

export function extractTaskTitleQuery(input: string): string | null {
  const text = input.trim();
  const patterns = [
    /(?:名称|名字|标题|题目)\s*(?:是|为|叫|等于|包含)\s*["“”'‘’「」『』《》]?(.+?)(?=["“”'‘’「」『』《》]?(?:，|。|,|\.|；|;|$|往后|推迟|顺延|延期|后移|改到))/u,
    /(?:叫|名叫)\s*["“”'‘’「」『』《》]?(.+?)(?=["“”'‘’「」『』《》]?(?:的)?(?:任务|计划|待办|事项|，|。|,|\.|；|;|$))/u,
    /(?:删除|删掉|移除|清除)\s*(?:今天|今日|明天|昨天)?(?:的)?\s*["“”'‘’「」『』《》]?(.+?)(?=["“”'‘’「」『』《》]?(?:的)?(?:任务|计划|待办|事项)?$)/u,
    /(?:推迟|顺延|往后推|往后延|延期|后移)\s*["“”'‘’「」『』《》]?(.+?)(?=["“”'‘’「」『』《》]?(?:的)?(?:任务|计划|待办|事项)?$)/u,
    /(?:把|将)\s*(?:今天|今日|明天|昨天)?(?:的)?(?:一个|某个)?\s*["“”'‘’「」『』《》]?(.+?)(?=["“”'‘’「」『』《》]?(?:往后|推迟|顺延|延期|后移|改到))/u,
    /["“”'‘’「」『』《》]?(.+?)["“”'‘’「」『』《》]?\s*这个(?:任务|计划|待办|事项)?/u,
    /["“”'‘’「」『』《》]?(.+?)["“”'‘’「」『』《》]?\s*的(?:任务|计划|待办|事项)/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const normalized = normalizeTaskTitleQuery(raw);
    if (normalized && !GENERIC_TITLE_WORDS.has(normalized)) return normalized;
  }
  return null;
}

function parseTags(task: Task): string[] {
  try {
    const parsed = JSON.parse(task.tags);
    return Array.isArray(parsed) ? parsed.map((item) => `${item}`) : [];
  } catch {
    return task.tags
      .split(/[,，、\s]+/u)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function scopeTasks(tasks: Task[], scope: TaskResolveScope): Task[] {
  const active = tasks.filter((task) => task.status === "todo" && !task.trashed_at);
  if (scope.mode === "global") return active;
  if (scope.mode === "today_view") return active.filter((task) => isInTodayView(task, scope.date));
  if (scope.mode === "planned_today") {
    return active.filter((task) => task.planned_date?.slice(0, 10) === scope.date);
  }
  if (scope.mode === "yesterday") {
    return filterTasksByDate(active, "planned_or_deadline", "eq", scope.date);
  }
  return filterTasksByDate(active, "planned_or_deadline", "lte", scope.date);
}

function isSpecificShortTitle(title: string) {
  return title.length >= 2 && title.length <= 12 && !GENERIC_TITLE_WORDS.has(title);
}

function uniqueTasks(tasks: Task[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

export function resolveTaskCandidates(
  tasks: Task[],
  rawQuery: string,
  scope: TaskResolveScope = { mode: "global" },
): TaskResolveResult {
  const query = normalizeTaskTitleQuery(rawQuery);
  const scoped = scopeTasks(tasks, scope);
  if (!query) {
    return { status: "no_match", query, candidates: [], suggestions: scoped.slice(0, 5) };
  }

  const exact = scoped.filter((task) => task.title === query);
  if (exact.length > 0) {
    return {
      status: exact.length === 1 ? "matched" : "ambiguous",
      query,
      candidates: exact,
      suggestions: exact.slice(0, 5),
    };
  }

  const titleContains = scoped.filter((task) => task.title.includes(query));
  const queryContainsTitle = scoped.filter((task) => isSpecificShortTitle(task.title) && query.includes(task.title));
  const tagContains = scoped.filter((task) => parseTags(task).some((tag) => tag === query || tag.includes(query) || query.includes(tag)));
  const candidates = uniqueTasks([...titleContains, ...queryContainsTitle, ...tagContains]);
  const suggestions = uniqueTasks([
    ...candidates,
    ...scoped.filter((task) => task.title.includes(query.slice(0, 2)) || query.includes(task.title.slice(0, 2))),
  ]).slice(0, 5);

  if (candidates.length === 0) return { status: "no_match", query, candidates: [], suggestions };
  if (candidates.length > 1) return { status: "ambiguous", query, candidates, suggestions: candidates.slice(0, 5) };
  return { status: "matched", query, candidates, suggestions: candidates };
}

export function formatNoMatchMessage(query: string, suggestions: Task[] = []) {
  const lines = [`没有找到名称为「${query}」的任务。`];
  if (suggestions.length > 0) {
    lines.push("", "你是不是想操作下面这些任务？", ...suggestions.map((task) => `- ${task.title}`));
  }
  return lines.join("\n");
}

export function formatAmbiguousMessage(query: string, candidates: Task[]) {
  return [
    `我找到了多个包含「${query}」的任务，请选择要操作哪一个：`,
    ...candidates.slice(0, 10).map((task, index) => `${index + 1}. ${task.title}`),
  ].join("\n");
}

export type StudyProjectResolveResult =
  | { status: "matched"; project: StudyProject }
  | { status: "ambiguous"; candidates: StudyProject[] }
  | { status: "no_match" };

export function extractPlanQuery(input: string): string | null {
  const text = input.trim();
  const patterns = [
    /(?:把|将|对)\s*(.+?)(?:复习计划|学习计划|考试计划|备考计划|计划)\s*(?:往后|推迟|顺延|延期|后移|暂停|恢复|归档)/u,
    /(?:.+?)(?:复习计划|学习计划|考试计划|备考计划|计划)/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw && raw.length >= 2) return raw;
  }
  // Fallback: check if the text itself is a study project name
  if (/复习计划|学习计划|考试计划|备考计划|计划/.test(text)) {
    return text.replace(/(?:把|将|对)\s*/u, "").replace(/(?:往后|推迟|顺延|延期|后移|暂停|恢复|归档).*/u, "").trim();
  }
  return null;
}

export function resolveStudyProject(
  query: string,
  projects: StudyProject[],
): StudyProjectResolveResult {
  if (!projects.length) return { status: "no_match" };
  const normalized = normalizeTaskTitleQuery(query);
  if (!normalized) return { status: "no_match" };

  // 1. Exact name match
  const exact = projects.filter((p) => p.name === normalized || p.name === query);
  if (exact.length === 1) return { status: "matched", project: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };

  // 2. Name contains query
  const nameContains = projects.filter((p) => p.name.includes(normalized));
  if (nameContains.length === 1) return { status: "matched", project: nameContains[0] };
  if (nameContains.length > 1) return { status: "ambiguous", candidates: nameContains };

  // 3. Subject match
  const subjectMatch = projects.filter((p) => p.subject && (p.subject.includes(normalized) || normalized.includes(p.subject)));
  if (subjectMatch.length === 1) return { status: "matched", project: subjectMatch[0] };
  if (subjectMatch.length > 1) return { status: "ambiguous", candidates: subjectMatch };

  // 4. Exam type match
  const examMatch = projects.filter((p) => p.exam_type && (p.exam_type.includes(normalized) || normalized.includes(p.exam_type)));
  if (examMatch.length === 1) return { status: "matched", project: examMatch[0] };
  if (examMatch.length > 1) return { status: "ambiguous", candidates: examMatch };

  // 5. Query contains project name (for short project names)
  const queryContains = projects.filter((p) => p.name.length >= 2 && normalized.includes(p.name));
  if (queryContains.length === 1) return { status: "matched", project: queryContains[0] };
  if (queryContains.length > 1) return { status: "ambiguous", candidates: queryContains };

  return { status: "no_match" };
}

export function resolveTasksByProject(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((t) => t.study_project_id === projectId && t.status === "todo" && !t.trashed_at && !!t.planned_date);
}
