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
