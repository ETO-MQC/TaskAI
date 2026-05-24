import type { StudyProject, Task } from "./types";

export interface StudyProjectStats {
  total: number;
  completed: number;
  incomplete: number;
  overdue: number;
  today: number;
  noPlannedDate: number;
  progressPercent: number;
}

export interface StudyProjectDayGroup {
  date: string;
  label: string;
  tasks: Task[];
  taskCount: number;
  totalMinutes: number;
  overloaded: boolean;
}

export interface StudyProjectRisk {
  level: "stable" | "warning" | "danger";
  message: string;
}

export interface StudyProjectDashboard {
  project: StudyProject;
  remainingDays: number | null;
  tasks: Task[];
  completedTasks: Task[];
  incompleteTasks: Task[];
  stats: StudyProjectStats;
  todayTasks: Task[];
  upcomingGroups: StudyProjectDayGroup[];
  overdueTasks: Task[];
  noPlannedDateTasks: Task[];
  risks: StudyProjectRisk[];
}

export type StudyProjectTaskFilter = "all" | "incomplete" | "completed" | "overdue" | "no_date";

function dateKey(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

function localDateKey(value: Date = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return localDateKey(parsed);
}

function diffDays(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.ceil((b - a) / 86400000);
}

function taskMinutes(task: Task) {
  return typeof task.estimated_duration === "number" && Number.isFinite(task.estimated_duration)
    ? task.estimated_duration
    : 0;
}

function activeProjectTasks(tasks: Task[], projectId: string) {
  return tasks.filter((task) =>
    task.study_project_id === projectId
    && task.status !== "archived"
    && !task.trashed_at,
  );
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aDate = dateKey(a.planned_date) ?? "9999-99-99";
    const bDate = dateKey(b.planned_date) ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

function dayLabel(date: string, today: string) {
  if (date === today) return "今天";
  if (date === addDays(today, 1)) return "明天";
  if (date === addDays(today, 2)) return "后天";
  return date;
}

function buildStats(projectTasks: Task[], today: string): StudyProjectStats {
  const completed = projectTasks.filter((task) => task.status === "done");
  const incomplete = projectTasks.filter((task) => task.status !== "done");
  const total = projectTasks.length;
  return {
    total,
    completed: completed.length,
    incomplete: incomplete.length,
    overdue: incomplete.filter((task) => {
      const planned = dateKey(task.planned_date);
      return !!planned && planned < today;
    }).length,
    today: incomplete.filter((task) => dateKey(task.planned_date) === today).length,
    noPlannedDate: incomplete.filter((task) => !dateKey(task.planned_date)).length,
    progressPercent: total > 0 ? Math.round((completed.length / total) * 100) : 0,
  };
}

function buildUpcomingGroups(incompleteTasks: Task[], dailyMinutes: number | null | undefined, today: string) {
  const end = addDays(today, 7);
  const byDate = new Map<string, Task[]>();
  for (const task of incompleteTasks) {
    const planned = dateKey(task.planned_date);
    if (!planned || planned < today || planned > end) continue;
    byDate.set(planned, [...(byDate.get(planned) ?? []), task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tasks]) => {
      const sorted = sortTasks(tasks);
      const totalMinutes = sorted.reduce((sum, task) => sum + taskMinutes(task), 0);
      return {
        date,
        label: dayLabel(date, today),
        tasks: sorted,
        taskCount: sorted.length,
        totalMinutes,
        overloaded: typeof dailyMinutes === "number" && dailyMinutes > 0 ? totalMinutes > dailyMinutes : false,
      };
    });
}

function buildRisks(input: {
  stats: StudyProjectStats;
  remainingDays: number | null;
  overloadedGroups: StudyProjectDayGroup[];
}): StudyProjectRisk[] {
  const risks: StudyProjectRisk[] = [];
  if (input.stats.overdue > 0) {
    risks.push({ level: "danger", message: `该项目有 ${input.stats.overdue} 个逾期任务，建议调整后续计划。` });
  }
  if (input.stats.noPlannedDate > 0) {
    risks.push({ level: "warning", message: `有 ${input.stats.noPlannedDate} 个任务尚未安排日期。` });
  }
  if (input.remainingDays != null && input.remainingDays <= 7 && input.stats.incomplete > 0) {
    risks.push({ level: "danger", message: `距离考试不足 7 天，仍有 ${input.stats.incomplete} 个任务未完成。` });
  }
  if (input.overloadedGroups.length > 0) {
    risks.push({ level: "warning", message: "部分日期任务量超过每日计划时间。" });
  }
  return risks.length > 0 ? risks : [{ level: "stable", message: "当前项目安排较稳定。" }];
}

export function buildStudyProjectDashboard(
  project: StudyProject,
  tasks: Task[],
  today = localDateKey(),
): StudyProjectDashboard {
  const projectTasks = sortTasks(activeProjectTasks(tasks, project.id));
  const completedTasks = projectTasks.filter((task) => task.status === "done");
  const incompleteTasks = projectTasks.filter((task) => task.status !== "done");
  const stats = buildStats(projectTasks, today);
  const todayTasks = sortTasks(incompleteTasks.filter((task) => dateKey(task.planned_date) === today));
  const overdueTasks = sortTasks(incompleteTasks.filter((task) => {
    const planned = dateKey(task.planned_date);
    return !!planned && planned < today;
  }));
  const noPlannedDateTasks = sortTasks(incompleteTasks.filter((task) => !dateKey(task.planned_date)));
  const upcomingGroups = buildUpcomingGroups(incompleteTasks, project.daily_minutes, today);
  const examDate = dateKey(project.exam_date);
  const remainingDays = examDate ? diffDays(today, examDate) : null;

  return {
    project,
    remainingDays,
    tasks: projectTasks,
    completedTasks,
    incompleteTasks,
    stats,
    todayTasks,
    upcomingGroups,
    overdueTasks,
    noPlannedDateTasks,
    risks: buildRisks({
      stats,
      remainingDays,
      overloadedGroups: upcomingGroups.filter((group) => group.overloaded),
    }),
  };
}

export function filterStudyProjectDashboardTasks(
  dashboard: StudyProjectDashboard,
  filter: StudyProjectTaskFilter,
) {
  if (filter === "incomplete") return dashboard.incompleteTasks;
  if (filter === "completed") return dashboard.completedTasks;
  if (filter === "overdue") return dashboard.overdueTasks;
  if (filter === "no_date") return dashboard.noPlannedDateTasks;
  return dashboard.tasks;
}
