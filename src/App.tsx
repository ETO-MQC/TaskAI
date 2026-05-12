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
import { useAppStore } from "./lib/store";
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

function taskDateKey(task: Task) {
  if (task.planned_date) return task.planned_date.slice(0, 10);
  if (task.deadline) return dayjs(task.deadline).format("YYYY-MM-DD");
  return "";
}

function isTaskVisibleForDateFilter(task: Task, filter: TaskDateFilter, customDate: string) {
  if (task.status === "archived") return false;
  if (filter === "all") return true;
  const today = dayjs().startOf("day");
  const dateKey = taskDateKey(task);
  const date = dateKey ? dayjs(dateKey) : null;
  if (filter === "custom") return dateKey === customDate;
  if (filter === "tomorrow") return dateKey === today.add(1, "day").format("YYYY-MM-DD");
  if (filter === "week") return !!date && date.isBetween(today.subtract(1, "millisecond"), today.endOf("week"), null, "[]");
  if (!dateKey) return task.status !== "done";
  if (dateKey === today.format("YYYY-MM-DD")) return true;
  const overdue = date?.isBefore(today, "day") && task.status !== "done";
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
          <div className="min-h-0 flex-1 pb-1">
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
              <div className="glass-inset flex shrink-0 p-1 text-sm">
                <button className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${centerPanel === "timer" ? "btn-glow font-medium" : "text-[var(--muted-foreground)] hover:text-[var(--neon-blue)]"}`} onClick={() => setCenterPanel("timer")}>
                  计时
                </button>
                <button className={`rounded-lg px-4 py-1.5 [transition:var(--transition-smooth)] ${centerPanel === "calendar" ? "btn-glow font-medium" : "text-[var(--muted-foreground)] hover:text-[var(--neon-blue)]"}`} onClick={() => setCenterPanel("calendar")}>
                  日历
                </button>
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
          <div className="glass-inset flex min-h-[104px] items-center gap-4 p-5 text-sm leading-7">
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
        className="mt-4 mb-2 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          sendAi(input);
          setInput("");
        }}
      >
        <button className={`grid h-10 w-10 place-items-center rounded-full border border-white/10 text-[var(--muted-foreground)] [transition:var(--transition-smooth)] hover:text-[var(--neon-violet)] ${listening ? "text-[var(--neon-pink)] shadow-[var(--shadow-glow-violet)]" : ""}`} type="button" onClick={startSpeech} title="语音输入">
          <Mic size={18} />
        </button>
        <input className="glass-inset min-w-0 px-3 py-2 text-sm outline-none [transition:var(--transition-smooth)] focus:border-[var(--ring)]" value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入或语音描述你想做的事..." />
        <button className="btn-glow grid h-10 w-12 place-items-center rounded-xl text-sm font-semibold" type="submit" title="发送">
          <Send size={17} />
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
  const { tasks, selectedTaskId, selectTask } = useAppStore();
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>("today");
  const [customDate, setCustomDate] = useState(defaultTaskDate);
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const visibleTasks = tasks.filter((task) => isTaskVisibleForDateFilter(task, dateFilter, customDate));
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
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto pr-1 lg:grid-cols-2">
          {[1, 2, 3, 4].map((quadrant) => (
            <QuadrantColumn
              key={quadrant}
              quadrant={quadrant}
              tasks={visibleTasks.filter((task) => task.quadrant === quadrant)}
              onSelect={selectTask}
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

function QuadrantColumn({ quadrant, tasks, onSelect }: { quadrant: number; tasks: Task[]; onSelect: (id: string) => void }) {
  return (
    <div className="glass-card p-3 [transition:var(--transition-smooth)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: quadrantColors[quadrant] }}>
          Q{quadrant} {quadrantLabels[quadrant]}
        </h3>
        <span className="glass-inset px-2 py-0.5 text-xs opacity-80">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onSelect={() => onSelect(task.id)} />
        ))}
        {tasks.length === 0 && <p className="glass-inset border-dashed p-4 text-sm opacity-60">暂无任务</p>}
      </div>
    </div>
  );
}

function TaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const { updateTask, deleteTask, startFocus } = useAppStore();
  const done = task.status === "done";
  const overdue = taskOverdueLabel(task);
  return (
    <div className="glass-inset group p-3 text-sm [transition:var(--transition-smooth)] hover:-translate-y-0.5 hover:border-[var(--ring)]" onClick={onSelect}>
      <div className="flex items-center gap-2">
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
  const { timer, startTimer, pauseTimer, resetTimer, stopTimer } = useAppStore();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [topic, setTopic] = useState("自由专注");
  const [pomodoroMinutes, setPomodoroMinutes] = useState("25");
  const [countdownHours, setCountdownHours] = useState("0");
  const [countdownMinutes, setCountdownMinutes] = useState("30");
  const [lastCountdownSeconds, setLastCountdownSeconds] = useState(30 * 60);
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
    startTimer({ topic, mode, target_seconds });
  };

  return (
    <section className="glass-card animate-fade-in flex h-full min-h-0 flex-col p-5">
      <Header title="专注计时" subtitle="Rust 后端 Instant 管理起止时间，前端消费后端秒级状态" />
      <div className="grid flex-1 place-items-center">
        <div className="flex w-full max-w-4xl flex-col items-center gap-6">
          <div className="flex gap-2">
            {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((item) => (
              <button key={item} className={`rounded-xl px-4 py-2 text-sm [transition:var(--transition-smooth)] ${mode === item ? "btn-glow" : "glass-inset text-[var(--muted-foreground)]"}`} onClick={() => switchMode(item)}>
                {modeLabel(item)}
              </button>
            ))}
          </div>
          <TimerOrb seconds={displaySeconds} progress={progress} paused={timer.paused} mode={activeMode} />
          <p className="max-w-xl text-center text-sm text-[var(--muted-foreground)]">{modeDescription(mode)}</p>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
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
        </div>
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

function CalendarView() {
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
      <div className="timer-orb-core absolute inset-[18%] rounded-full">
        <div className="timer-orb-wave" style={{ top: `${waveLevel}%`, "--wave-color": modeColor } as CSSProperties}>
          <span />
          <span />
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
