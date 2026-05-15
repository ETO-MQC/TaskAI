import type { Importance, Priority, Task, TimerMode, Urgency } from "./types";

export const quadrantColors: Record<number, string> = {
  1: "#EF4444",
  2: "#F59E0B",
  3: "#3B82F6",
  4: "#9CA3AF",
};

export const quadrantLabels: Record<number, string> = {
  1: "重要且紧急",
  2: "重要不紧急",
  3: "紧急不重要",
  4: "不重要不紧急",
};

export const timerColors: Record<TimerMode, string> = {
  positive: "#3B82F6",
  pomodoro: "#EF4444",
  countdown: "#F59E0B",
};

export function calculateQuadrant(urgency: Urgency, importance: Importance) {
  if (urgency === "urgent" && importance === "important") return 1;
  if (urgency === "not_urgent" && importance === "important") return 2;
  if (urgency === "urgent" && importance === "not_important") return 3;
  return 4;
}

export function parseTags(task: Task) {
  try {
    return JSON.parse(task.tags || "[]") as string[];
  } catch {
    return [];
  }
}

export function priorityLabel(priority: Priority) {
  return priority === "high" ? "高" : priority === "medium" ? "中" : "低";
}

export function modeLabel(mode: TimerMode) {
  if (mode === "pomodoro") return "番茄钟";
  if (mode === "countdown") return "倒计时";
  return "正计时";
}

export function formatMinutes(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)}秒`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatSeconds(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import type { TimerRecord } from "./types";
dayjs.extend(isSameOrBefore);

export interface RecommendedTask extends Task {
  recommendReason: string;
  recommendScore: number;
}

export function getRecommendedTasks(
  tasks: Task[],
  records: TimerRecord[],
  topic: string,
  selectedTaskId: string | null
): RecommendedTask[] {
  const incompleteTasks = tasks.filter(t => t.status !== "done" && t.status !== "archived");
  const today = dayjs().startOf('day');
  
  const recentTaskIds = new Set<string>();
  const recentRecords = records.slice(0, 20); // Check recent 20 records
  for (const r of recentRecords) {
    if (r.task_id) recentTaskIds.add(r.task_id);
  }

  const scoredTasks = incompleteTasks.map(task => {
    let score = 0;
    const reasons: string[] = [];

    // Is selected
    if (task.id === selectedTaskId) {
      score += 100;
      // Do not add reason for selection to keep tags clean, or add it later if needed
    }

    // Date rules
    let isToday = false;
    let isOverdue = false;
    if (task.planned_date && dayjs(task.planned_date).isSame(today, "day")) isToday = true;
    if (task.deadline && dayjs(task.deadline).isSame(today, "day")) isToday = true;
    
    if (task.deadline && dayjs(task.deadline).isBefore(today, "day")) isOverdue = true;
    else if (task.planned_date && dayjs(task.planned_date).isBefore(today, "day")) isOverdue = true;

    if (!task.planned_date && !task.deadline) {
      // Unplanned tasks shouldn't get "today" penalty or bonus without checks, but the rule says:
      // "无 planned_date 但未完成" also counts for today candidates if no clear date. We'll give it a slight bonus or we'll just rely on urgency
    }

    if (isToday) {
      score += 30;
      reasons.push("今日任务");
    } else if (isOverdue) {
      score += 35;
      reasons.push("逾期未完成");
    }

    // Quadrant rules
    let isUrgent = task.urgency === "urgent";
    let isImportant = task.importance === "important";
    
    if (isUrgent && isImportant) {
      score += 25; // Q1
      if (!reasons.includes("逾期未完成") && !reasons.includes("今日任务")) reasons.push("重要且紧急");
    } else if (!isUrgent && isImportant) {
      score += 15; // Q2
      if (!reasons.length) reasons.push("重要优先");
    }
    
    if (isUrgent && !isImportant) {
      score += 10;
    }

    // Recent
    if (recentTaskIds.has(task.id)) {
      score += 15;
      reasons.push("曾经关联过");
    }

    // Topic Match
    if (topic && topic !== "自由专注" && topic !== "仅记录时间") {
      const kw = topic.toLowerCase();
      const inTitle = task.title.toLowerCase().includes(kw);
      const inNotes = task.description?.toLowerCase().includes(kw);
      const tags = parseTags(task);
      const inTags = tags.some(t => t.toLowerCase().includes(kw));
      
      if (inTitle || inNotes || inTags) {
        score += 25;
        reasons.push("与当前主题匹配");
      }
    }

    return {
      ...task,
      recommendScore: score,
      recommendReason: reasons[0] || (score > 0 ? "推荐任务" : "")
    };
  });

  // Filter tasks that have at least some score
  const candidates = scoredTasks.filter(t => t.recommendScore > 0);
  candidates.sort((a, b) => b.recommendScore - a.recommendScore);

  return candidates.slice(0, 5);
}
