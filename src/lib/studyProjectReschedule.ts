import type {
  ProjectDailyLoad,
  ProjectReschedulePreview,
  ProjectRescheduleSkippedTask,
  StudyProject,
  Task,
  TimerRecord,
} from "./types";

export type StudyProjectRescheduleStrategy = ProjectReschedulePreview["strategy"];

export interface StudyProjectContext {
  project: StudyProject;
  tasks: {
    total: number;
    completed: number;
    incomplete: number;
    overdue: number;
    today: number;
    upcoming: number;
    noPlannedDate: number;
    trashedExcluded: number;
  };
  schedule: {
    firstPlannedDate: string | null;
    lastPlannedDate: string | null;
    examDate: string | null;
    remainingDays: number | null;
    dailyMinutes: number | null;
    currentDailyLoad: ProjectDailyLoad[];
    overloadedDays: ProjectDailyLoad[];
  };
  recentExecution: {
    completedLast7Days: number;
    focusMinutesLast7Days: number;
    missedToday: boolean;
    hasTimerData: boolean;
  };
  eligibleTasks: Task[];
  skipped: ProjectRescheduleSkippedTask[];
  warnings: string[];
}

function dateKey(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

function localDate(value: Date = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return localDate(parsed);
}

function daysBetweenInclusive(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

function minutesForTask(task: Task, warnings: string[]) {
  if (typeof task.estimated_duration === "number" && Number.isFinite(task.estimated_duration)) {
    return task.estimated_duration;
  }
  warnings.push(`任务「${task.title}」缺少 estimated_duration，已按 45 分钟估算。`);
  return 45;
}

function buildDailyLoad(tasks: Task[], overrides = new Map<string, string | null>(), dailyMinutes?: number | null): ProjectDailyLoad[] {
  const byDate = new Map<string, ProjectDailyLoad>();
  for (const task of tasks) {
    const date = overrides.has(task.id) ? overrides.get(task.id) : dateKey(task.planned_date);
    if (!date) continue;
    const row = byDate.get(date) ?? { date, minutes: 0, taskCount: 0 };
    row.minutes += task.estimated_duration ?? 0;
    row.taskCount += 1;
    row.overloaded = dailyMinutes ? row.minutes > dailyMinutes : false;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildStudyProjectContext(
  projectId: string,
  projects: StudyProject[],
  tasks: Task[],
  records: TimerRecord[] = [],
  now = localDate(),
): StudyProjectContext | null {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;

  const allProjectTasks = tasks.filter((task) => task.study_project_id === projectId);
  const activeProjectTasks = allProjectTasks.filter((task) => task.status !== "archived" && !task.trashed_at);
  const completed = activeProjectTasks.filter((task) => task.status === "done");
  const incomplete = activeProjectTasks.filter((task) => task.status !== "done");
  const noPlanned = incomplete.filter((task) => !dateKey(task.planned_date));
  const plannedIncomplete = incomplete.filter((task) => !!dateKey(task.planned_date));
  const plannedDates = plannedIncomplete.map((task) => dateKey(task.planned_date)!).sort();
  const dailyMinutes = project.daily_minutes ?? null;
  const currentDailyLoad = buildDailyLoad(plannedIncomplete, new Map(), dailyMinutes);
  const recentStart = addDays(now, -6);
  const projectTaskIds = new Set(activeProjectTasks.map((task) => task.id));
  const recentRecords = records.filter((record) => record.task_id && projectTaskIds.has(record.task_id) && dateKey(record.started_at)! >= recentStart);
  const todayTasks = plannedIncomplete.filter((task) => dateKey(task.planned_date) === now);
  const todayCompleted = todayTasks.filter((task) => task.status === "done").length;
  const warnings = noPlanned.length > 0
    ? [`${noPlanned.length} 个未完成任务没有 planned_date，本次不会自动改日期。`]
    : [];

  return {
    project,
    tasks: {
      total: activeProjectTasks.length,
      completed: completed.length,
      incomplete: incomplete.length,
      overdue: plannedIncomplete.filter((task) => dateKey(task.planned_date)! < now).length,
      today: todayTasks.length,
      upcoming: plannedIncomplete.filter((task) => dateKey(task.planned_date)! > now).length,
      noPlannedDate: noPlanned.length,
      trashedExcluded: allProjectTasks.length - activeProjectTasks.length,
    },
    schedule: {
      firstPlannedDate: plannedDates[0] ?? null,
      lastPlannedDate: plannedDates[plannedDates.length - 1] ?? null,
      examDate: dateKey(project.exam_date),
      remainingDays: project.exam_date ? daysBetweenInclusive(now, dateKey(project.exam_date)!) : null,
      dailyMinutes,
      currentDailyLoad,
      overloadedDays: currentDailyLoad.filter((row) => !!row.overloaded),
    },
    recentExecution: {
      completedLast7Days: completed.filter((task) => dateKey(task.updated_at)! >= recentStart).length,
      focusMinutesLast7Days: recentRecords.reduce((sum, record) => sum + record.duration, 0),
      missedToday: todayTasks.length > 0 && todayCompleted === 0,
      hasTimerData: recentRecords.length > 0,
    },
    eligibleTasks: plannedIncomplete,
    skipped: [
      ...completed.map((task) => ({ id: task.id, title: task.title, reason: "已完成任务不参与重排" })),
      ...noPlanned.map((task) => ({ id: task.id, title: task.title, reason: "缺少 planned_date" })),
    ],
    warnings,
  };
}

export function buildProjectReschedulePreview(options: {
  context: StudyProjectContext;
  strategy: StudyProjectRescheduleStrategy;
  shiftDays?: number;
  pauseDays?: number;
  dailyMinutes?: number | null;
  now?: string;
}): ProjectReschedulePreview {
  const now = options.now ?? localDate();
  const warnings = [...options.context.warnings];
  const examDate = options.context.schedule.examDate;
  const dailyMinutes = options.dailyMinutes ?? options.context.schedule.dailyMinutes ?? 45;
  const affectedDates = new Map<string, string | null>();
  let targetTasks = options.context.eligibleTasks;

  if (options.strategy === "missed_today") {
    targetTasks = targetTasks.filter((task) => dateKey(task.planned_date)! >= now);
    const hasToday = targetTasks.some((task) => dateKey(task.planned_date) === now);
    if (!hasToday) warnings.push("该项目今天没有未完成的已排期任务，本次仅生成空预览。");
    for (const task of hasToday ? targetTasks : []) {
      affectedDates.set(task.id, addDays(dateKey(task.planned_date)!, 1));
    }
  } else if (options.strategy === "pause") {
    const pauseDays = Math.max(1, options.pauseDays ?? options.shiftDays ?? 1);
    targetTasks = targetTasks.filter((task) => dateKey(task.planned_date)! >= now);
    for (const task of targetTasks) {
      affectedDates.set(task.id, addDays(dateKey(task.planned_date)!, pauseDays));
    }
  } else if (options.strategy === "compress" || options.strategy === "redistribute") {
    const start = addDays(now, 1);
    if (!examDate) {
      warnings.push("项目没有 exam_date，已退化为从明天开始按每日上限重新分配。");
    }
    const end = examDate ?? addDays(start, Math.max(0, targetTasks.length - 1));
    let cursor = start;
    let used = 0;
    for (const task of [...targetTasks].sort((a, b) => dateKey(a.planned_date)!.localeCompare(dateKey(b.planned_date)!))) {
      const minutes = minutesForTask(task, warnings);
      if (minutes > dailyMinutes) {
        warnings.push(`任务「${task.title}」估时 ${minutes} 分钟超过每日上限 ${dailyMinutes} 分钟，本轮不拆分任务。`);
      }
      if (used > 0 && used + minutes > dailyMinutes) {
        cursor = addDays(cursor, 1);
        used = 0;
      }
      if (examDate && cursor > end) {
        warnings.push("可用日期不足，部分任务无法排入考试日期前。");
        break;
      }
      affectedDates.set(task.id, cursor);
      used += minutes;
    }
  } else {
    const shiftDays = Math.max(1, options.shiftDays ?? 1);
    for (const task of targetTasks) {
      affectedDates.set(task.id, addDays(dateKey(task.planned_date)!, shiftDays));
    }
  }

  if (examDate && [...affectedDates.values()].some((date) => date && date > examDate)) {
    warnings.push("顺延后部分任务超过考试日期，建议压缩后续任务或增加每日学习时间。");
  }

  const affectedPreview = targetTasks
    .filter((task) => affectedDates.has(task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      old_planned_date: dateKey(task.planned_date),
      new_planned_date: affectedDates.get(task.id) ?? null,
      estimated_duration: task.estimated_duration ?? null,
      status: task.status,
    }))
    .filter((item) => item.new_planned_date && item.new_planned_date !== item.old_planned_date);

  const afterOverrides = new Map(affectedPreview.map((item) => [item.id, item.new_planned_date]));
  const dailyLoadAfter = buildDailyLoad(options.context.eligibleTasks, afterOverrides, dailyMinutes);
  const riskLevel = warnings.length > 0 ? "medium" : "low";
  const strategyLabel = options.strategy === "missed_today" ? "今天未执行顺延" : options.strategy;

  return {
    actionType: "project_reschedule",
    projectId: options.context.project.id,
    projectName: options.context.project.name,
    strategy: options.strategy,
    affectedTaskIds: affectedPreview.map((item) => item.id),
    affectedPreview,
    skipped: options.context.skipped,
    warnings: [...new Set(warnings)],
    dailyLoadBefore: options.context.schedule.currentDailyLoad,
    dailyLoadAfter,
    summary: `将对「${options.context.project.name}」执行${strategyLabel}，影响 ${affectedPreview.length} 个任务，跳过 ${options.context.skipped.length} 个任务。`,
    riskLevel,
    requiresConfirmation: true,
  };
}
