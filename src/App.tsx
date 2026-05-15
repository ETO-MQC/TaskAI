import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CirclePlay,
  Clock3,
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
import { TaskUpdatePatch, useAppStore } from "./lib/store";
import type { Importance, Priority, Task, TimerMode, Urgency } from "./lib/types";
import {
  formatMinutes,
  formatSeconds,
  modeLabel,
  parseTags,
  priorityLabel,
  quadrantColors,
  quadrantLabels,
} from "./lib/domain";

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

const aiShortcutEventName = "smartfocus_ai_shortcut";

function requestAiInputFocus() {
  useAppStore.getState().setAiOpen(true);
  window.setTimeout(() => window.dispatchEvent(new Event(aiShortcutEventName)), 0);
}

function App() {
  const store = useAppStore();

  useEffect(() => {
    store.load();
    let unlistenTimer: (() => void) | undefined;
    let unlistenAi: (() => void) | undefined;
    let unlistenTaskCreated: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        unlistenTimer = await listen("timer_tick", (event) => {
          useAppStore.setState({ timer: event.payload as typeof store.timer });
        });
        unlistenAi = await listen("shortcut_toggle_ai", () => {
          requestAiInputFocus();
        });
        unlistenTaskCreated = await listen("task_created", () => {
          useAppStore.getState().load();
        });
      })
      .catch(() => undefined);
    return () => {
      unlistenTimer?.();
      unlistenAi?.();
      unlistenTaskCreated?.();
    };
  }, []);

  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) return;
    const intervalId = window.setInterval(() => {
      const current = useAppStore.getState().timer;
      if (!current.active || current.paused) return;
      const elapsed_seconds = current.elapsed_seconds + 1;
      useAppStore.setState({
        timer: {
          ...current,
          elapsed_seconds,
          remaining_seconds:
            current.target_seconds == null ? null : Math.max(0, current.target_seconds - elapsed_seconds),
        },
      });
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
    </div>
  );
}

function Sidebar() {
  const { view, setView } = useAppStore();
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
            className={`group flex h-11 w-[calc(100%-16px)] items-center justify-center gap-3 rounded-xl text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:bg-white/10 hover:text-[var(--foreground)] ${
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
  const { tasks, timer, records, selectTask, startFocus, startTimer, pauseTimer, resetTimer, stopTimer, setView } = useAppStore();
  const [timerMode, setTimerMode] = useState<TimerMode>("positive");
  const [centerPanel, setCenterPanel] = useState<"timer" | "calendar">("timer");
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
  const currentTopic = timer.topic || todayTasks[0]?.title || "自由专注";
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
        <section data-ui-region="ai-command" className="glass-card hero-card-light lift-card flex min-h-[320px] flex-col overflow-hidden p-5">
          <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div>
              <p className="section-label flex items-center gap-2">
                <Sparkles size={15} /> AI Agent Command Stream
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-normal text-[var(--foreground)] md:text-3xl">
                今天想怎么<span className="neon-text">编排?</span>
              </h1>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                告诉我你想推进什么，我会拆解任务、安排专注时段并启动计时。
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => setView("ai")}>
                打开 AI 工作区
              </button>
            <button type="button" className="glass-inset px-4 py-2 text-sm [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)]" onClick={() => setView("tasks")}>
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
                <button
                  key={task.id}
                  className="glass-inset interactive-surface flex w-full items-center gap-3 p-3 text-left hover:border-[var(--ring)]"
                  onClick={() => {
                    selectTask(task.id);
                    setView("tasks");
                  }}
                >
                  <PriorityDot quadrant={task.quadrant} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{task.title}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">
                      Q{task.quadrant} {quadrantLabels[task.quadrant]} · {task.estimated_duration ? formatMinutes(task.estimated_duration) : "未估时"}
                    </span>
                  </span>
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      startFocus(task);
                    }}
                  >
                    <CirclePlay size={15} />
                  </span>
                </button>
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
                  <h3 className="mt-1 text-lg font-bold leading-snug">{currentTopic}</h3>
                </div>
                <div className="glass-inset p-3 text-xs leading-6 text-[var(--muted-foreground)]">
                  {modeDescription(timerMode)}
                </div>
                <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                  {!timer.active ? (
                    <button
                      className="btn-glow flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                      onClick={() =>
                        startTimer({
                          topic: currentTopic,
                          mode: timerMode,
                          task_id: todayTasks[0]?.id ?? null,
                          target_seconds: modeTargetSeconds(timerMode, selectedTimerMinutes),
                        })
                      }
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
                  {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${timerMode === mode ? "btn-glow" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                      onClick={() => setTimerMode(mode)}
                    >
                      {modeLabel(mode)}
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

function AiPanel({ embedded = false }: { embedded?: boolean }) {
  const { aiMessages, setAiOpen, sendAi } = useAppStore();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const streamBuffer = useRef("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("ai_stream", (event) => {
          const payload = event.payload as { delta?: unknown; done?: boolean };
          if (payload.done) {
            streamBuffer.current = "";
            return;
          }
          if (typeof payload.delta !== "string") return;
          const parsed = parseAiStreamDelta(`${streamBuffer.current}${payload.delta}`);
          streamBuffer.current = parsed.rest;
          useAppStore.getState().appendAiStream(parsed.delta);
        }),
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [aiMessages]);

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
      if (text) sendAi(text);
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
      <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
        {aiMessages.length === 0 ? (
          <div className="glass-inset flex min-h-[104px] flex-col items-start gap-5 p-5 text-sm leading-7">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--neon-blue)] text-[var(--background)] shadow-[0_0_26px_var(--neon-blue)]">
              <Sparkles size={18} />
            </span>
            <p>今天想怎么安排？告诉我你想创建什么任务、开始什么计时，我会用四象限帮你排序。</p>
          </div>
        ) : (
          aiMessages.map((message, index) => (
            <div key={index} className={`rounded-xl p-4 text-sm leading-6 [transition:var(--transition-smooth)] ${message.role === "user" ? "btn-glow ml-12 text-[var(--primary-foreground)]" : "glass-inset mr-12"}`}>
              {message.content || (message.role === "assistant" ? "正在思考..." : "")}
              {message.clarification && <div className="glass-inset mt-2 p-2 text-[var(--neon-amber)]">{message.clarification}</div>}
            </div>
          ))
        )}
      </div>
      <form
        className="mt-auto mb-0 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          sendAi(input);
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

function AiView() {
  return (
    <section className="glass-card flex h-full min-h-0 flex-col overflow-hidden p-5">
      <Header title="AI 助手" subtitle="任务拆解、日程安排和计时指令入口" />
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="glass-inset flex min-h-[420px] flex-col overflow-hidden p-4">
          <AiPanel embedded />
        </div>
        <aside className="thin-scrollbar grid min-h-0 gap-4 overflow-y-auto pr-1">
          <div className="glass-inset p-4">
            <p className="section-label">Result Preview</p>
            <h3 className="mt-2 font-semibold">AI 生成结果预览区</h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">任务拆解、计划草案和资料整理结果会先显示在这里，确认后再写入本地数据。</p>
          </div>
          <button className="glass-inset interactive-surface p-4 text-left" type="button">
            <p className="section-label">Upload</p>
            <h3 className="mt-2 font-semibold">文件上传入口</h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">预留资料、课件、PDF 和笔记导入。</p>
          </button>
          {["学习规划", "考研 / 考公规划", "资料规划"].map((label) => (
            <button key={label} className="glass-inset interactive-surface p-4 text-left" type="button">
              <h3 className="font-semibold">{label}</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">预留模板入口，本轮只稳定工作区结构。</p>
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}

function TasksView() {
  const { tasks, selectedTaskId, selectTask, updateTask } = useAppStore();
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>("today");
  const [customDate, setCustomDate] = useState(defaultTaskDate);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchDate, setBatchDate] = useState(defaultTaskDate);
  const [batchUrgency, setBatchUrgency] = useState<Urgency>("not_urgent");
  const [batchImportance, setBatchImportance] = useState<Importance>("not_important");
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
        <TaskForm />
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
          <span className="ml-auto text-xs text-[var(--muted-foreground)]">今日视图顺延重要或紧急的逾期未完成任务</span>
        </div>
        <div className="glass-inset mt-3 flex flex-wrap items-center gap-2 p-2 text-sm">
          <span className="px-2 text-xs font-medium text-[var(--muted-foreground)]">已选择 {selectedCount} 项</span>
          <input className="field py-1.5" type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} />
          <button
            type="button"
            className="glass-inset px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-blue)] disabled:opacity-40"
            disabled={selectedCount === 0}
            onClick={() => confirmBatch("延期到指定日期", (task) => updateTask({ id: task.id, planned_date: batchDate }))}
          >
            批量延期
          </button>
          <button
            type="button"
            className="glass-inset px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-amber)] disabled:opacity-40"
            disabled={selectedCount === 0}
            onClick={() => confirmBatch("标记为待整理", (task) => updateTask({ id: task.id, tags: tagsWithNeedsReview(task) }))}
          >
            标记待整理
          </button>
          <button
            type="button"
            className="glass-inset px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-emerald-400 disabled:opacity-40"
            disabled={selectedCount === 0}
            onClick={() => confirmBatch("批量完成", (task) => updateTask({ id: task.id, status: "done" }))}
          >
            批量完成
          </button>
          <select className="field py-1.5" value={batchImportance} onChange={(event) => setBatchImportance(event.target.value as Importance)}>
            <option value="important">重要</option>
            <option value="not_important">不重要</option>
          </select>
          <select className="field py-1.5" value={batchUrgency} onChange={(event) => setBatchUrgency(event.target.value as Urgency)}>
            <option value="urgent">紧急</option>
            <option value="not_urgent">不紧急</option>
          </select>
          <button
            type="button"
            className="glass-inset px-3 py-1.5 text-xs [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)] disabled:opacity-40"
            disabled={selectedCount === 0}
            onClick={() => confirmBatch("调整重要/紧急", (task) => updateTask({ id: task.id, urgency: batchUrgency, importance: batchImportance }))}
          >
            应用优先级
          </button>
          {selectedCount > 0 && (
            <button type="button" className="ml-auto text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setSelectedIds([])}>
              取消选择
            </button>
          )}
        </div>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto pr-1 lg:grid-cols-2">
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
    </section>
  );
}

function TaskForm() {
  const createTask = useAppStore((state) => state.createTask);
  const [draft, setDraft] = useState(emptyDraft);
  const [taskDate, setTaskDate] = useState(defaultTaskDate);
  const [taskTime, setTaskTime] = useState(defaultTaskTime);
  const update = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="glass-inset grid grid-cols-1 gap-2 p-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        await createTask({
          ...draft,
          deadline: combineLocalDateTime(taskDate, taskTime),
          planned_date: taskDate,
        });
        setDraft(emptyDraft);
        setTaskDate(defaultTaskDate());
        setTaskTime(defaultTaskTime());
      }}
    >
      <input className="field" value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="输入任务标题" />
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
      <button className="btn-glow rounded-xl px-4 py-2 text-sm font-semibold" type="submit">
        创建
      </button>
      <textarea className="field min-h-16 xl:col-span-2" value={draft.description} onChange={(e) => update("description", e.target.value)} placeholder="备注支持 Markdown：列表、加粗、链接" />
      <input className="field" type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
      <input className="field" type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
      <input className="field" value={draft.tags} onChange={(e) => update("tags", e.target.value)} placeholder="标签，逗号分隔" />
    </form>
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
  const dropToQuadrant = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("task-id");
    if (!id) return;
    await updateTask({ id, urgency: meta.urgency, importance: meta.importance });
  };
  return (
    <div className="glass-card p-3 [transition:var(--transition-smooth)]" onDragOver={(event) => event.preventDefault()} onDrop={dropToQuadrant}>
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
      <div className="space-y-2">
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
  return (
    <div
      className="glass-inset group p-3 text-sm [transition:var(--transition-smooth)] hover:-translate-y-0.5 hover:border-[var(--ring)]"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("task-id", task.id);
        event.dataTransfer.setData("text/plain", task.id);
      }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--neon-violet)]"
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
          onClick={(event) => {
            event.stopPropagation();
            updateTask({ id: task.id, status: done ? "todo" : "done" });
          }}
          title="完成"
        >
          <Check size={16} />
        </button>
        <strong className={done ? "task-done min-w-0 flex-1" : "min-w-0 flex-1"}>{task.title}</strong>
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
  const { tasks, records, timer, startTimer, pauseTimer, resetTimer, stopTimer } = useAppStore();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [topic, setTopic] = useState("自由专注");
  const [currentTaskId, setCurrentTaskId] = useState<string>("");
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
  const recommendedTasks = incompleteTasks.slice(0, 4);

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

  const switchMode = (nextMode: TimerMode) => {
    setMode(nextMode);
    if (nextMode === "pomodoro" && !pomodoroMinutes) setPomodoroMinutes("25");
    if (nextMode === "countdown") {
      const hours = Math.floor(lastCountdownSeconds / 3600);
      const minutes = Math.round((lastCountdownSeconds % 3600) / 60);
      setCountdownHours(String(hours));
      setCountdownMinutes(String(minutes));
    }
  };

  const startCurrentTimer = () => {
    const target_seconds = mode === "positive" ? null : mode === "pomodoro" ? selectedPomodoroMinutes * 60 : countdownSeconds;
    if (mode === "countdown") setLastCountdownSeconds(countdownSeconds);
    startTimer({ topic, mode, target_seconds, task_id: currentTaskId || null });
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
              value={currentTaskId} 
              onChange={(e) => {
                const id = e.target.value;
                setCurrentTaskId(id);
                if (id) {
                  const task = tasks.find(t => t.id === id);
                  if (task) setTopic(task.title);
                } else {
                  setTopic("自由专注");
                }
              }}
            >
              <option value="">仅记录时间 (无关联任务)</option>
              {incompleteTasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <input className="field" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="当前专注主题" />
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

          {!timer.active && recommendedTasks.length > 0 && (
            <div className="w-full max-w-2xl mt-4">
              <p className="text-sm font-semibold mb-2">推荐关联任务：</p>
              <div className="flex flex-wrap gap-2">
                {recommendedTasks.map(t => (
                  <button key={t.id} type="button" className={`glass-inset px-3 py-1.5 text-xs rounded-lg hover:text-[var(--neon-violet)] [transition:var(--transition-smooth)] ${currentTaskId === t.id ? 'ring-1 ring-[var(--neon-violet)] text-[var(--neon-violet)]' : ''}`} onClick={() => { setTopic(t.title); setCurrentTaskId(t.id); }}>
                    {t.title}
                  </button>
                ))}
              </div>
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
          <div className="glass-card chart-card col-span-2 h-80 p-4 md:col-span-3">
            <h3 className="mb-3 text-sm font-semibold">最近 7 天专注时长</h3>
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">来自 timer_records，包含当前正在运行的计时。</p>
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: "var(--ring)", strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="minutes" name="分钟" stroke="var(--neon-blue)" fill="oklch(0.72 0.2 240 / 0.22)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-card chart-card col-span-2 h-80 p-4 md:col-span-3">
            <h3 className="mb-3 text-sm font-semibold">最近 7 天完成任务数</h3>
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">按任务完成更新时间统计，不用示例数据填充。</p>
            <ResponsiveContainer>
              <BarChart data={trend}>
                <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "oklch(0.7 0.24 295 / 0.08)" }} />
                <Bar dataKey="completed" name="完成数" fill="var(--neon-violet)" radius={[6, 6, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5">
          <div className="glass-card chart-card h-[360px] p-4">
            <h3 className="mb-3 text-sm font-semibold">四象限任务分布</h3>
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">由任务的 urgency / importance 计算结果汇总。</p>
            <div className="relative h-[210px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={quadrantData} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="86%" paddingAngle={4} cornerRadius={8} stroke="oklch(1 0 0 / 0.18)" strokeWidth={1}>
                  {quadrantData.map((entry) => <Cell key={entry.quadrant} fill={quadrantColors[entry.quadrant]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <DonutCenter value={quadrantTotal} label="tasks" />
            </div>
            <ChartLegend items={quadrantLegend} />
          </div>
          <div className="glass-card chart-card h-[360px] p-4">
            <h3 className="mb-3 text-sm font-semibold">完成 / 未完成分布</h3>
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">展示当前真实任务状态，归档任务不计入未完成。</p>
            <div className="relative h-[210px]">
            <ResponsiveContainer>
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
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="86%" paddingAngle={5} cornerRadius={9} stroke="oklch(1 0 0 / 0.18)" strokeWidth={1}>
                  <Cell fill="url(#doneGradient)" />
                  <Cell fill="url(#openGradient)" />
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <DonutCenter value={statusTotal} label="tasks" />
            </div>
            <ChartLegend items={statusLegend} />
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
            <div className="mt-2 text-xs text-[var(--muted-foreground)]">Confidence {Math.round(suggestion.confidence * 100)}%</div>
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
        const [settings, baseUrl, model] = await Promise.all([
          api<typeof shortcuts>("get_shortcut_settings"),
          api<string | null>("get_setting", { key: "api_base_url" }),
          api<string | null>("get_setting", { key: "api_model" }),
        ]);
        setShortcuts(settings);
        setApiBaseUrl(baseUrl || "https://api.deepseek.com/v1");
        setApiModel(model || "deepseek-chat");
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
          <input className="field w-full" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-..." />
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
                api("save_setting", { key: "deepseek_api_key", value: apiKey }),
                api("save_setting", { key: "api_base_url", value: apiBaseUrl }),
                api("save_setting", { key: "api_model", value: apiModel }),
              ]);
            });
            setSaved(true);
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
  const waveLevel = 84 - Math.min(100, Math.max(0, progress)) * 0.52;
  const modeColor = mode === "pomodoro" ? "var(--prio-p1)" : mode === "countdown" ? "var(--neon-amber)" : "var(--neon-blue)";
  return (
    <div
      className={`timer-orb relative mx-auto grid place-items-center overflow-visible rounded-full ${paused ? "outline-dashed outline-2 outline-offset-4 outline-[var(--ring)]" : ""}`}
      style={{
        width: compact ? "clamp(170px, 16vw, 230px)" : "clamp(180px, 18vw, 250px)",
        height: compact ? "clamp(170px, 16vw, 230px)" : "clamp(180px, 18vw, 250px)",
      }}
    >
      <div className="timer-orb-glow absolute inset-0 rounded-full" />
      <div className="timer-orb-shell absolute inset-[3%] rounded-full" />
      <div
        className="timer-orb-progress absolute inset-[6%] rounded-full"
        style={{
          background: `conic-gradient(from 220deg, var(--neon-violet) 0deg, var(--neon-blue) ${progressDegrees * 0.55}deg, var(--neon-pink) ${progressDegrees}deg, transparent ${progressDegrees}deg 360deg)`,
        }}
      />
      <div className="timer-orb-core absolute inset-[18%] rounded-full overflow-hidden">
        <div className={`timer-orb-wave ${paused ? "opacity-60 scale-95" : "scale-100"} [transition:all_800ms_cubic-bezier(0.34,1.56,0.64,1)]`} style={{ top: `${waveLevel}%`, "--wave-color": modeColor } as CSSProperties}>
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <div className={`font-mono tabular-nums ${compact ? "text-[32px] md:text-[36px]" : "text-[38px] md:text-[42px]"} font-bold leading-none tracking-wider text-[var(--foreground)] drop-shadow-[0_0_14px_var(--neon-violet)]`}>
          {formatSeconds(seconds)}
        </div>
        <div className="mt-2 text-xs text-[var(--muted-foreground)]">{seconds > 0 ? "专注中" : "等待开始"}</div>
      </div>
    </div>
  );
}

export default App;
