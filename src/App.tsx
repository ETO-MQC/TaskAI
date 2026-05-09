import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CirclePlay,
  Clock3,
  ClipboardList,
  LayoutDashboard,
  ListTodo,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
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
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import { useAppStore } from "./lib/store";
import type { Importance, Priority, Task, TimerMode, TimerSnapshot, Urgency } from "./lib/types";
import {
  formatMinutes,
  formatSeconds,
  modeLabel,
  parseTags,
  priorityLabel,
  quadrantColors,
  quadrantLabels,
} from "./lib/domain";
import { api } from "./lib/api";

const navItems = [
  { id: "workbench", label: "工作台", icon: LayoutDashboard },
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

const timerModeColors: Record<TimerMode, { light: string; dark: string; track: string }> = {
  positive: { light: "#2563EB", dark: "#60A5FA", track: "rgba(96, 165, 250, 0.18)" },
  pomodoro: { light: "#DC2626", dark: "#F87171", track: "rgba(248, 113, 113, 0.18)" },
  countdown: { light: "#D97706", dark: "#FBBF24", track: "rgba(251, 191, 36, 0.2)" },
};

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
    // Frontend Fallback only: Vite/browser mode has no Rust timer_tick event,
    // so setInterval directly advances the Zustand timer snapshot every second.
    const intervalId = window.setInterval(async () => {
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
    <div className="app-shell second-gen-shell h-screen min-w-[320px] overflow-x-auto overflow-y-hidden p-2 text-slate-100 md:p-4">
      <div className="flex h-full min-w-[320px] gap-2 md:gap-4">
        <Sidebar />
        <main className="glass second-gen-main flex min-w-[320px] flex-1 flex-col overflow-hidden rounded-lg p-3 md:p-5">
          {store.view === "workbench" && <WorkbenchView />}
          {store.view === "tasks" && <TasksView />}
          {store.view === "timer" && <TimerView />}
          {store.view === "calendar" && <CalendarView />}
          {store.view === "stats" && <StatsView />}
          {store.view === "settings" && <SettingsView />}
          {store.view === "ai" && <AiPanel embedded />}
        </main>
      </div>
      <button
        className="fixed bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white text-slate-950 shadow-glow transition hover:scale-105"
        onClick={() => store.setAiOpen(true)}
        title="AI助手"
      >
        <Bot size={24} />
      </button>
      {store.aiOpen && <AiPanel />}
      {store.linkPanelOpen && <LinkRecordPanel />}
    </div>
  );
}

function Sidebar() {
  const { view, setView } = useAppStore();
  return (
    <aside className="glass second-gen-sidebar flex w-16 min-w-16 max-w-[220px] shrink-0 flex-col items-center gap-3 rounded-lg py-4 transition-all duration-300 md:hover:w-[180px] md:hover:min-w-[180px]">
      <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/10 text-sm font-bold text-white">
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
            className={`group flex h-11 w-[calc(100%-16px)] items-center justify-center gap-3 rounded-lg border border-transparent text-slate-400 transition hover:border-white/10 hover:bg-white/10 hover:text-white ${
              active ? "border-white/10 bg-white/10 text-white shadow-inner" : ""
            }`}
          >
            <Icon size={20} />
            <span className="hidden whitespace-nowrap text-sm font-medium md:group-hover:inline">
              {item.label}
            </span>
          </button>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-2 opacity-60">
        <ListTodo size={16} />
        <Clock3 size={16} />
        <CalendarDays size={16} />
        <BarChart3 size={16} />
      </div>
    </aside>
  );
}

function WorkbenchView() {
  const { tasks, timer, records, selectTask, startFocus, startTimer, pauseTimer, resetTimer, setView, theme } = useAppStore();
  const [fusionMode, setFusionMode] = useState<"timer" | "calendar">("timer");
  const [timerDraftMode, setTimerDraftMode] = useState<TimerMode>("positive");
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [countdownHours, setCountdownHours] = useState(0);
  const [countdownMinutes, setCountdownMinutes] = useState(30);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(dayjs().format("YYYY-MM-DD"));
  const today = dayjs().format("YYYY-MM-DD");
  const activeTasks = tasks
    .filter((task) => task.status !== "archived")
    .sort((a, b) => {
      const plannedA = a.planned_date === today ? 0 : 1;
      const plannedB = b.planned_date === today ? 0 : 1;
      return plannedA - plannedB || a.quadrant - b.quadrant || b.sort_order - a.sort_order;
    });
  const todayTasks = activeTasks
    .filter((task) => task.status !== "done" && (!task.planned_date || task.planned_date === today))
    .slice(0, 6);
  const plannedToday = tasks.filter((task) => task.planned_date === today && task.status !== "archived");
  const recentRecords = records
    .filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === today)
    .slice(0, 4);
  const todayRecords = records.filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === today);
  const recordedFocusMinutes = todayRecords.reduce((sum, record) => sum + record.duration, 0);
  const liveFocusMinutes = timer.active ? timer.elapsed_seconds / 60 : 0;
  const todayFocusMinutes = recordedFocusMinutes + liveFocusMinutes;
  const unfinishedCount = tasks.filter((task) => task.status !== "done" && task.status !== "archived").length;
  const todayTotalTasks = plannedToday.length > 0 ? plannedToday.length : tasks.filter((task) => task.status !== "archived").length;
  const todayDoneTasks = (plannedToday.length > 0 ? plannedToday : tasks).filter((task) => task.status === "done").length;
  const completionRate = todayTotalTasks > 0 ? Math.round((todayDoneTasks / todayTotalTasks) * 100) : 0;
  const displaySeconds =
    timer.mode === "positive" || !timer.remaining_seconds ? timer.elapsed_seconds : timer.remaining_seconds;
  const focusTopic = todayTasks[0]?.title ?? "自由专注";
  const timerMode = timer.active ? (timer.mode ?? "positive") : timerDraftMode;
  const timerColor = timerModeColors[timerMode][theme];
  const timerTrack = timerModeColors[timerMode].track;
  const draftTargetSeconds =
    timerDraftMode === "positive"
      ? null
      : timerDraftMode === "pomodoro"
        ? pomodoroMinutes * 60
        : Math.max(60, (countdownHours * 60 + countdownMinutes) * 60);
  const timerTarget = timer.target_seconds ?? draftTargetSeconds ?? Math.max(3600, timer.elapsed_seconds || 3600);
  const timerProgress =
    timerMode === "positive"
      ? Math.min(100, (timer.elapsed_seconds / timerTarget) * 100)
      : Math.min(100, ((timerTarget - (timer.remaining_seconds ?? timerTarget)) / timerTarget) * 100);
  const visibleTimerProgress = timer.active ? Math.max(timerProgress, 1.5) : 6;
  const gardenProgress = Math.min(100, Math.round(todayFocusMinutes / 240 * 100));
  const calendarMonth = dayjs(selectedCalendarDate).startOf("month");
  const calendarDays = useMemo(
    () => Array.from({ length: 35 }, (_, index) => calendarMonth.startOf("week").add(index, "day")),
    [calendarMonth],
  );
  const selectedCalendarTasks = tasks.filter((task) => task.planned_date === selectedCalendarDate && task.status !== "archived");
  const startWorkbenchTimer = () => {
    startTimer({
      topic: focusTopic,
      mode: timerDraftMode,
      task_id: todayTasks[0]?.id ?? null,
      target_seconds: draftTargetSeconds,
    });
  };

  return (
    <section className="workbench-grid min-h-0 flex-1">
      <div className="workbench-center min-w-0">
        <div className="command-stream min-w-0">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="card-kicker"><Sparkles size={15} /> AI Agent Command Stream</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white md:text-3xl">今天想怎么安排？</h1>
            </div>
            <button className="btn-secondary gap-2" onClick={() => setView("tasks")}>
              <Plus size={16} /> 手动创建
            </button>
          </div>
          <div className="ai-panel-frame h-[300px] max-h-[300px] min-h-0">
            <AiPanel embedded />
          </div>
        </div>

        <div className="workbench-content min-h-0">
          <section className="second-gen-panel min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="card-kicker"><ClipboardList size={15} /> Today Stack</p>
                <h2 className="card-title">今日待办</h2>
              </div>
              <button className="btn-secondary gap-2" onClick={() => setView("tasks")}>
                <ListTodo size={15} />
                查看任务
              </button>
            </div>
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="workbench-task-card w-full cursor-pointer text-left"
                  role="button"
                  tabIndex={0}
                  style={{ borderColor: `${quadrantColors[task.quadrant]}66` }}
                  onClick={() => {
                    selectTask(task.id);
                    setView("tasks");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    selectTask(task.id);
                    setView("tasks");
                  }}
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: quadrantColors[task.quadrant] }} />
                  <span className="min-w-0 flex-1">
                    <span className="task-title block truncate text-sm font-semibold text-slate-950 dark:text-white">{task.title}</span>
                    <span className="task-meta mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Q{task.quadrant} {quadrantLabels[task.quadrant]}</span>
                      <span>{task.deadline ? dayjs(task.deadline).format("MM-DD HH:mm") : "无截止"}</span>
                      <span>{task.estimated_duration ? formatMinutes(task.estimated_duration) : "未估时"}</span>
                    </span>
                  </span>
                  <button
                    className="icon-btn shrink-0"
                    title="开始专注"
                    onClick={(event) => {
                      event.stopPropagation();
                      startFocus(task);
                    }}
                  >
                    <CirclePlay size={15} />
                  </button>
                </div>
              ))}
              {todayTasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">
                  还没有今日待办，可以直接在上方让 AI 创建或安排任务。
                </div>
              )}
            </div>
          </section>

          <section className="second-gen-panel fusion-panel min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="card-kicker"><Clock3 size={15} /> Timeline + Timer</p>
                <h2 className="card-title">日历计时融合视图</h2>
              </div>
              <div className="fusion-tabs" role="tablist" aria-label="日历计时融合视图模式">
                <button className={fusionMode === "timer" ? "active" : ""} onClick={() => setFusionMode("timer")} type="button">
                  ⏱️ 计时
                </button>
                <button className={fusionMode === "calendar" ? "active" : ""} onClick={() => setFusionMode("calendar")} type="button">
                  📅 日历
                </button>
              </div>
            </div>

            <div className="fusion-stage">
              <div className={`fusion-pane ${fusionMode === "timer" ? "active" : "inactive-left"}`}>
                <div className="fusion-timer-layout">
                  <div className="grid justify-items-center gap-4">
                    <div
                      className="workbench-timer-ring workbench-timer-ring-large"
                      style={{
                        background: `conic-gradient(${timerColor} ${visibleTimerProgress * 3.6}deg, ${timerTrack} 0deg)`,
                        borderColor: `${timerColor}55`,
                        boxShadow: `inset 0 0 0 1px rgba(148, 163, 184, 0.18), 0 0 0 5px ${timerColor}14`,
                      }}
                    >
                      <div className="workbench-timer-ring-inner workbench-timer-ring-inner-large">
                        <span>{formatSeconds(timer.active ? displaySeconds : timerDraftMode === "positive" ? 0 : timerTarget)}</span>
                      </div>
                    </div>
                    <div className="timer-mode-switch" aria-label="计时模式">
                      {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((item) => (
                        <button
                          key={item}
                          className={timerDraftMode === item ? "active" : ""}
                          disabled={timer.active}
                          onClick={() => setTimerDraftMode(item)}
                          type="button"
                        >
                          {modeLabel(item)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="fusion-timer-controls">
                    <div>
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">当前主题</p>
                      <h3 className="mt-1 truncate text-xl font-bold text-slate-950 dark:text-white">
                        {timer.active ? timer.topic : focusTopic}
                      </h3>
                    </div>

                    <div className="timer-param-panel">
                      {timerDraftMode === "positive" && (
                        <p>正计时无需设置时长，点击开始后自动向上计时，结束时保存本次专注记录。</p>
                      )}
                      {timerDraftMode === "pomodoro" && (
                        <div>
                          <p>番茄钟专注时长</p>
                          <div className="timer-preset-row">
                            {[15, 25, 30, 45, 60].map((value) => (
                              <button
                                key={value}
                                className={pomodoroMinutes === value ? "active" : ""}
                                disabled={timer.active}
                                onClick={() => setPomodoroMinutes(value)}
                                type="button"
                              >
                                {value}m
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {timerDraftMode === "countdown" && (
                        <div>
                          <p>倒计时结束后停止并进入记录流程</p>
                          <div className="timer-duration-inputs">
                            <label>
                              小时
                              <input value={countdownHours} min={0} max={12} disabled={timer.active} onChange={(event) => setCountdownHours(Math.max(0, Number(event.target.value) || 0))} type="number" />
                            </label>
                            <label>
                              分钟
                              <input value={countdownMinutes} min={1} max={59} disabled={timer.active} onChange={(event) => setCountdownMinutes(Math.max(1, Number(event.target.value) || 1))} type="number" />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {!timer.active ? (
                        <button className="btn-primary gap-2" onClick={startWorkbenchTimer}>
                          <Play size={17} /> 开始
                        </button>
                      ) : (
                        <button className="btn-primary gap-2" onClick={pauseTimer}>
                          {timer.paused ? <Play size={17} /> : <Pause size={17} />} {timer.paused ? "继续" : "暂停"}
                        </button>
                      )}
                      <button className="btn-secondary gap-2" onClick={resetTimer}>
                        <RotateCcw size={17} /> 重置
                      </button>
                      <button className="btn-secondary gap-2" onClick={() => setView("timer")}>
                        <Clock3 size={17} /> 完整计时页
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`fusion-pane ${fusionMode === "calendar" ? "active" : "inactive-right"}`}>
                <div className="fusion-calendar-layout">
                  <div className="fusion-calendar-header">
                    <button type="button" onClick={() => setSelectedCalendarDate(dayjs(selectedCalendarDate).subtract(1, "month").format("YYYY-MM-DD"))}>‹</button>
                    <strong>{calendarMonth.format("YYYY 年 MM 月")}</strong>
                    <button type="button" onClick={() => setSelectedCalendarDate(dayjs(selectedCalendarDate).add(1, "month").format("YYYY-MM-DD"))}>›</button>
                  </div>
                  <div className="fusion-calendar-grid">
                    {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                      <span key={day} className="fusion-weekday">{day}</span>
                    ))}
                    {calendarDays.map((day) => {
                      const key = day.format("YYYY-MM-DD");
                      const dayItems = tasks.filter((task) => task.planned_date === key && task.status !== "archived");
                      const isSelected = key === selectedCalendarDate;
                      const isMuted = day.month() !== calendarMonth.month();
                      return (
                        <button
                          key={key}
                          className={`fusion-calendar-day ${isSelected ? "selected" : ""} ${isMuted ? "muted" : ""}`}
                          onClick={() => setSelectedCalendarDate(key)}
                          type="button"
                        >
                          <span>{day.date()}</span>
                          <span className="fusion-day-dots">
                            {dayItems.slice(0, 3).map((task) => (
                              <i key={task.id} style={{ background: quadrantColors[task.quadrant] }} />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="fusion-day-tasks">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{dayjs(selectedCalendarDate).format("MM 月 DD 日")}</strong>
                      <span>{selectedCalendarTasks.length} 项</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {selectedCalendarTasks.map((task) => (
                        <button key={task.id} className="fusion-day-task" onClick={() => { selectTask(task.id); setView("tasks"); }} type="button">
                          <i style={{ background: quadrantColors[task.quadrant] }} />
                          <span>{task.title}</span>
                        </button>
                      ))}
                      {selectedCalendarTasks.length === 0 && <p className="rounded-lg border border-dashed border-slate-300/60 p-3 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">这一天还没有计划任务。</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <aside className="workbench-side min-w-0">
        <section className="second-gen-panel">
          <div className="flex items-center gap-2">
            <p className="card-kicker"><Sprout size={15} /> Focus Garden</p>
          </div>
          <div className="mt-4 grid justify-items-center gap-3 text-center">
            <GardenPlant progress={gardenProgress} />
            <div className="text-3xl font-semibold text-slate-950 dark:text-white">{gardenProgress}%</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {gardenProgress === 0 ? "播下一颗专注种子，开始第一段计时。" : "专注正在生长，继续保持今天的节奏。"}
            </p>
          </div>
        </section>

        <section className="second-gen-panel">
          <div className="mb-4 flex items-center gap-2">
            <p className="card-kicker"><BarChart3 size={15} /> Quick Stats</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SignalRow icon={<Clock3 size={18} />} label="今日专注" value={formatMinutes(todayFocusMinutes)} />
            <SignalRow icon={<Check size={18} />} label="完成率" value={`${completionRate}%`} />
            <SignalRow icon={<ClipboardList size={18} />} label="未完成" value={`${unfinishedCount} 项`} />
            <SignalRow icon={<BarChart3 size={18} />} label="今日计时" value={`${todayRecords.length} 次`} />
          </div>
        </section>

        <section className="second-gen-panel">
          <div className="mb-3 flex items-center gap-2">
            <p className="card-kicker"><Trophy size={15} /> Achievements</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-200">深度专注者</span>
              <span className="text-slate-500">{Math.min(4, todayRecords.length)}/4</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(100, (todayRecords.length / 4) * 100)}%` }} />
            </div>
          </div>
        </section>
      </aside>
    </section>
  );
}

function MiniPlanRing({ planned, records, minutes }: { planned: number; records: number; minutes: number }) {
  const plannedPct = Math.min(100, planned * 16);
  const actualPct = Math.min(100, (minutes / 360) * 100);
  return (
    <div className="mini-plan-ring grid place-items-center rounded-lg p-4">
      <div
        className="grid h-36 w-36 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#60A5FA ${actualPct * 3.6}deg, rgba(245,158,11,.55) 0deg ${Math.max(actualPct, plannedPct) * 3.6}deg, rgba(255,255,255,.08) 0deg)`,
        }}
      >
        <div className="mini-plan-ring-core grid h-28 w-28 place-items-center rounded-full text-center">
          <div>
            <div className="text-2xl font-semibold text-white">{records}</div>
            <div className="text-xs text-slate-500">records</div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">计划 {planned} 项 / 实际 {formatMinutes(minutes)}</p>
    </div>
  );
}

function GardenPlant({ progress }: { progress: number }) {
  const isSeed = progress === 0;
  const isFlower = progress >= 60;
  return (
    <svg className="garden-svg" viewBox="0 0 120 120" role="img" aria-label="Focus Garden">
      <circle cx="60" cy="60" r="48" className="garden-svg-bg" />
      {isSeed ? (
        <>
          <ellipse cx="60" cy="72" rx="14" ry="10" className="garden-seed" />
          <path d="M46 82c10 8 24 8 34 0" className="garden-soil" />
        </>
      ) : (
        <>
          <path d="M60 88V50" className="garden-stem" />
          <path d="M60 66c-20-4-27-17-24-28 17 1 25 11 24 28Z" className="garden-leaf" />
          <path d="M61 74c21-6 28-19 25-31-18 1-27 13-25 31Z" className="garden-leaf garden-leaf-2" />
          {isFlower && (
            <>
              <circle cx="60" cy="42" r="9" className="garden-flower-core" />
              <circle cx="60" cy="28" r="8" className="garden-flower" />
              <circle cx="74" cy="42" r="8" className="garden-flower" />
              <circle cx="60" cy="56" r="8" className="garden-flower" />
              <circle cx="46" cy="42" r="8" className="garden-flower" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

function SignalRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="signal-card">
      <span className="signal-icon">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1 block truncate text-base font-semibold text-slate-950 dark:text-white">{value}</span>
      </span>
    </div>
  );
}

function TasksView() {
  const { tasks, selectedTaskId, selectTask } = useAppStore();
  const activeTasks = tasks.filter((task) => task.status !== "archived");
  const selected = activeTasks.find((task) => task.id === selectedTaskId) ?? activeTasks[0] ?? null;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="任务列表" subtitle="未完成 / 已完成 / 四象限" />
        <TaskForm />
        {activeTasks.length === 0 && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-white/50 bg-blue-50/70 px-4 py-3 text-sm font-medium text-slate-700 shadow-md dark:border-white/10 dark:bg-blue-500/10 dark:text-slate-100">
            <Bot size={18} />
            <span>还没有任务，对 AI 说一句话试试吧~</span>
          </div>
        )}
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto pr-1 lg:grid-cols-2">
          {[1, 2, 3, 4].map((quadrant) => (
            <QuadrantColumn
              key={quadrant}
              quadrant={quadrant}
              tasks={activeTasks.filter((task) => task.quadrant === quadrant)}
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
  const update = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.title.trim()) return;
        await createTask(draft);
        setDraft(emptyDraft);
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
      <button className="btn-primary" type="submit">
        创建
      </button>
      <textarea
        className="field min-h-16 sm:col-span-2"
        value={draft.description}
        onChange={(e) => update("description", e.target.value)}
        placeholder="备注支持 Markdown：列表、加粗、链接"
      />
      <input className="field" type="datetime-local" value={draft.deadline} onChange={(e) => update("deadline", e.target.value)} />
      <input className="field" type="date" value={draft.planned_date} onChange={(e) => update("planned_date", e.target.value)} />
      <input className="field" value={draft.tags} onChange={(e) => update("tags", e.target.value)} placeholder="标签，逗号分隔" />
    </form>
  );
}

function QuadrantColumn({ quadrant, tasks, onSelect }: { quadrant: number; tasks: Task[]; onSelect: (id: string) => void }) {
  const quadrantMeta: Record<number, { label: string; className: string; borderClass: string }> = {
    1: { label: "🔴 重要且紧急", className: "from-red-50/95 to-red-100/45", borderClass: "dark:border-red-500/35" },
    2: { label: "🟡 重要不紧急", className: "from-amber-50/95 to-yellow-100/45", borderClass: "dark:border-amber-500/35" },
    3: { label: "🔵 紧急不重要", className: "from-blue-50/95 to-sky-100/45", borderClass: "dark:border-blue-500/35" },
    4: { label: "⚪ 不重要不紧急", className: "from-slate-50/95 to-slate-100/60", borderClass: "dark:border-slate-400/30" },
  };
  const meta = quadrantMeta[quadrant];
  return (
    <div className={`rounded-lg border border-white/60 bg-gradient-to-br p-3 shadow-md dark:bg-slate-950/45 dark:bg-none ${meta.borderClass} ${meta.className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold" style={{ color: quadrantColors[quadrant] }}>
          {meta.label}
        </h3>
        <span className="text-xs opacity-70">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onSelect={() => onSelect(task.id)} />
        ))}
        {tasks.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm opacity-60">暂无任务</p>}
      </div>
    </div>
  );
}

function TaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const { updateTask, deleteTask, startFocus } = useAppStore();
  const done = task.status === "done";
  return (
    <div className="group rounded-md bg-white p-3 text-sm shadow-md transition hover:-translate-y-0.5 dark:bg-slate-950/70" onClick={onSelect}>
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
        <strong className={done ? "task-title task-done min-w-0 flex-1" : "task-title min-w-0 flex-1"}>{task.title}</strong>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-white/10">{priorityLabel(task.priority)}</span>
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
  const records = useMemo(
    () => allRecords.filter((record) => record.task_id === task?.id),
    [allRecords, task?.id],
  );
  if (!task) {
    return <aside className="w-[360px] rounded-xl border border-dashed border-slate-300 p-5 opacity-70">选择任务后在这里查看详情。</aside>;
  }
  return (
    <aside className="flex w-full min-w-0 flex-col overflow-auto rounded-xl border border-white/30 bg-white/46 p-4 dark:border-white/10 dark:bg-white/5 xl:w-[380px] xl:min-w-[320px] xl:p-5">
      <div className="mb-4">
        <p className="text-xs opacity-60">任务详情</p>
        <h2 className="text-xl font-semibold">{task.title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info label="优先级" value={priorityLabel(task.priority)} />
        <Info label="象限" value={`Q${task.quadrant} ${quadrantLabels[task.quadrant]}`} />
        <Info label="截止" value={task.deadline ? dayjs(task.deadline).format("YYYY-MM-DD HH:mm") : "未设置"} />
        <Info label="计划日" value={task.planned_date || "未设置"} />
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-semibold">备注</h3>
        <div className="markdown rounded-lg bg-white/70 p-3 text-sm dark:bg-slate-950/30">
          <ReactMarkdown>{task.description || "暂无备注"}</ReactMarkdown>
        </div>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-semibold">标签</h3>
        <div className="flex flex-wrap gap-2">
          {parseTags(task).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-950 px-2 py-1 text-xs text-white dark:bg-white dark:text-slate-950">
              {tag}
            </span>
          ))}
          {parseTags(task).length === 0 && <span className="text-sm opacity-60">暂无标签</span>}
        </div>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-semibold">专注记录</h3>
        <p className="mb-2 text-sm opacity-70">累计 {formatMinutes(task.actual_total_duration)}</p>
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="rounded-lg bg-white/60 p-3 text-sm dark:bg-slate-950/30">
              <div className="font-medium">{modeLabel(record.mode)}</div>
              <div className="opacity-70">
                {dayjs(record.started_at).format("MM-DD HH:mm")} / {formatMinutes(record.duration)}
              </div>
            </div>
          ))}
          {records.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm opacity-60">Sprint 4 已预留并接通专注记录区域。</div>}
        </div>
      </div>
    </aside>
  );
}

function TimerView() {
  const { timer, startTimer, pauseTimer, resetTimer, stopTimer, theme } = useAppStore();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [topic, setTopic] = useState("自由专注");
  const [minutes, setMinutes] = useState("25");
  const isFallbackTimer = !("__TAURI_INTERNALS__" in window);
  const idleTimerForMode = (nextMode: TimerMode): TimerSnapshot => {
    const targetSeconds = nextMode === "positive" ? null : Math.max(1, Number(minutes) || 25) * 60;
    return {
      active: false,
      elapsed_seconds: 0,
      mode: nextMode,
      remaining_seconds: targetSeconds,
      target_seconds: targetSeconds,
      paused: false,
    };
  };
  const switchMode = async (nextMode: TimerMode) => {
    const wasActive = useAppStore.getState().timer.active;
    const nextTimer = idleTimerForMode(nextMode);
    setMode(nextMode);
    useAppStore.setState({ timer: nextTimer });
    if (wasActive) {
      await resetTimer();
      useAppStore.setState({ timer: nextTimer });
    }
  };
  useEffect(() => {
    if (useAppStore.getState().timer.active) return;
    useAppStore.setState({ timer: idleTimerForMode(mode) });
  }, [mode, minutes]);
  const currentMode = timer.mode ?? mode;
  const color = timerModeColors[currentMode][theme];
  const trackColor = timerModeColors[currentMode].track;
  const elapsed = timer.elapsed_seconds;
  const target = timer.target_seconds ?? (mode === "positive" ? Math.max(3600, elapsed || 3600) : Number(minutes) * 60);
  const progress = timer.mode === "positive" ? Math.min(100, (elapsed / target) * 100) : Math.min(100, ((target - (timer.remaining_seconds ?? target)) / target) * 100);
  const visibleProgress = timer.active ? Math.max(progress, 1.5) : 6;
  const displaySeconds = timer.mode === "positive" || !timer.remaining_seconds ? elapsed : timer.remaining_seconds;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Header title="专注计时" subtitle="Rust 后端 Instant 管理起止时间，前端消费后端秒级状态" />
      <div className="grid flex-1 place-items-center">
        <div className="flex w-full max-w-4xl flex-col items-center gap-6">
          <div className="flex flex-wrap justify-center gap-2">
            {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((item) => (
              <button
                key={item}
                className={`rounded-lg px-4 py-2 text-sm ${mode === item ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-white/60 dark:bg-white/10"}`}
                onClick={() => switchMode(item)}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>
          <div
            className={`relative grid h-72 w-72 place-items-center rounded-full ${timer.paused ? "outline-dashed outline-2 outline-offset-4" : ""}`}
            style={{
              background: `conic-gradient(${color} ${visibleProgress * 3.6}deg, ${trackColor} 0deg)`,
              border: `1px solid ${color}55`,
              boxShadow: timer.mode === "pomodoro" ? `0 0 38px ${color}55` : "none",
            }}
          >
            <div className="grid h-56 w-56 place-items-center rounded-full bg-white/88 dark:bg-slate-950/88">
              <div className="text-center">
                <div className="font-mono text-[32px] font-bold">{formatSeconds(displaySeconds)}</div>
                <div className="mt-1 text-sm opacity-65">{timer.active ? timer.topic : "等待开始"}</div>
              </div>
            </div>
          </div>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_120px]">
            <input className="field" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="当前专注主题" />
            <input className="field" value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min="1" />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {!timer.active ? (
              <button
                className="btn-primary gap-2"
                onClick={() =>
                  startTimer({
                    topic,
                    mode,
                    target_seconds: mode === "positive" ? null : Number(minutes) * 60,
                  })
                }
              >
                <Play size={18} /> 开始
              </button>
            ) : (
              <>
                <button className="btn-secondary gap-2" onClick={pauseTimer}>
                  <Pause size={18} /> {timer.paused ? "继续" : "暂停"}
                </button>
                <button className="btn-secondary gap-2" onClick={resetTimer}>
                  <RotateCcw size={18} /> 重置
                </button>
                <button className="btn-primary gap-2" onClick={() => stopTimer(timer.task_id ?? null)}>
                  <Square size={18} /> 结束
                </button>
              </>
            )}
          </div>
          <div className="rounded-lg bg-white/54 p-3 text-sm opacity-75 dark:bg-white/5">
            {isFallbackTimer
              ? "Fallback: 当前是 npm run dev 纯前端模式，计时由前端 setInterval 模拟，正式应用仍由 Rust tokio::time::Instant 管理。"
              : "托盘动态进度环使用 Tauri tray-icon API 与 base64 图标更新实现；Linux 作为已知限制记录在 Sprint 8。"}
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
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/30">
      <div className="glass mx-auto mb-0 w-full max-w-3xl rounded-t-2xl p-6">
        <h2 className="text-xl font-semibold">这段时间做了什么？</h2>
        <p className="mt-1 text-sm opacity-70">本次记录：{pendingRecord ? formatMinutes(pendingRecord.duration) : "0m"}</p>
        <div className="mt-4 grid gap-3">
          <select className="field" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">仅记录时间，不关联任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="field" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="或创建新任务后关联" />
            <button
              className="btn-secondary"
              onClick={async () => {
                if (!newTitle.trim()) return;
                await createTask({ ...emptyDraft, title: newTitle });
                setNewTitle("");
              }}
            >
              新建
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => confirmRecordLink(null)}>
              仅记录
            </button>
            <button className="btn-primary" onClick={() => confirmRecordLink(taskId || null)}>
              确认关联
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsView() {
  const stats = useAppStore((state) => state.stats);
  const tasks = useAppStore((state) => state.tasks);
  const records = useAppStore((state) => state.records);
  const data = stats?.quadrant_counts ?? [];
  const trend = stats?.trend ?? [];
  const taskTitleSegments = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const palette = ["#EF4444", "#F59E0B", "#3B82F6", "#10B981", "#A855F7", "#64748B"];
    const groups = new Map<string, { label: string; minutes: number; color: string }>();
    records
      .filter((record) => dayjs(record.started_at).format("YYYY-MM-DD") === today)
      .forEach((record) => {
        const task = tasks.find((item) => item.id === record.task_id);
        const label = task?.title || record.task_topic || "未关联专注";
        const current = groups.get(label);
        if (current) {
          current.minutes += record.duration;
          return;
        }
        groups.set(label, {
          label,
          minutes: record.duration,
          color: task ? quadrantColors[task.quadrant] : palette[groups.size % palette.length],
        });
      });
    return Array.from(groups.values());
  }, [records, tasks]);
  const ringSegments = taskTitleSegments.length > 0 ? taskTitleSegments : (stats?.ring_segments ?? []);
  const total = Math.max(1, ringSegments.reduce((sum, item) => sum + item.minutes, 0));
  const hasRingData = ringSegments.some((item) => item.minutes > 0);
  let offset = 0;
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Header title="今日数据" subtitle="日环进度圈、四象限饼图、趋势折线图、统计卡片" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 xl:grid-cols-2 xl:gap-5">
        <div className="rounded-xl bg-white/60 p-5 shadow-md dark:bg-white/5">
          <div className="grid place-items-center">
            <svg width="260" height="260" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="94" fill="none" stroke="#e5e7eb" strokeWidth="22" />
              {ringSegments.map((segment) => {
                const length = (segment.minutes / total) * 590;
                const circle = (
                  <circle
                    key={segment.label}
                    cx="130"
                    cy="130"
                    r="94"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="22"
                    strokeDasharray={`${length} 590`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                    transform="rotate(-90 130 130)"
                    className="transition-all duration-1000"
                  />
                );
                offset += length;
                return circle;
              })}
              <text x="130" y="122" textAnchor="middle" className="fill-current text-3xl font-bold">
                {hasRingData ? `${Math.round(((stats?.today_minutes ?? 0) / 360) * 100)}%` : "暂无"}
              </text>
              <text x="130" y="150" textAnchor="middle" className="fill-current text-sm opacity-70">
                {hasRingData ? "完成" : "专注记录"}
              </text>
            </svg>
          </div>
          <p className="text-center text-sm opacity-70">计划: 6h / 实际: {formatMinutes(stats?.today_minutes ?? 0)}</p>
          <div className="mt-4 grid gap-2 text-sm">
            {hasRingData ? (
              ringSegments.map((segment) => (
                <div key={segment.label} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-slate-950/30">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
                    {segment.label}
                  </span>
                  <span className="font-medium">{formatMinutes(segment.minutes)}</span>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center opacity-60">暂无专注记录</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="本周完成率" value={`${Math.round(stats?.weekly_completion_rate ?? 0)}%`} />
          <StatCard label="本月完成率" value={`${Math.round(stats?.monthly_completion_rate ?? 0)}%`} />
          <StatCard label="未完成任务" value={stats?.open_tasks ?? 0} />
          <StatCard label="今日完成任务数" value={stats?.completed_today ?? 0} />
          <StatCard label="今日计时次数" value={stats?.today_timer_count ?? 0} />
          <StatCard label="总任务" value={stats?.total_tasks ?? 0} />
          <div className="h-64 rounded-xl bg-white/50 p-4 dark:bg-white/5 sm:col-span-2 xl:col-span-3">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="quadrant" innerRadius={52} outerRadius={86}>
                  {data.map((entry) => (
                    <Cell key={entry.quadrant} fill={quadrantColors[entry.quadrant]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="h-72 rounded-xl bg-white/50 p-4 dark:bg-white/5 xl:col-span-2">
          <ResponsiveContainer>
            <AreaChart data={trend}>
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="minutes" stroke="#3B82F6" fill="#93C5FD" />
            </AreaChart>
          </ResponsiveContainer>
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
  const monthDays = useMemo(
    () => Array.from({ length: 35 }, (_, index) => selectedDay.startOf("month").startOf("week").add(index, "day")),
    [selected],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => selectedDay.startOf("week").add(index, "day")),
    [selected],
  );
  const selectedTasks = tasks.filter((task) => task.planned_date === selected);
  const dayTasks = (date: dayjs.Dayjs) => tasks.filter((task) => task.planned_date === date.format("YYYY-MM-DD"));
  const taskColor = (task: Task) => (task.priority === "high" ? "#EF4444" : task.priority === "medium" ? "#F59E0B" : "#3B82F6");
  const renderDots = (items: Task[]) => (
    <div className="mt-2 flex min-h-3 flex-wrap gap-1">
      {items.map((task) => (
        <span
          key={task.id}
          draggable
          onDragStart={(event) => event.dataTransfer.setData("task-id", task.id)}
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: taskColor(task) }}
          title={task.title}
        />
      ))}
    </div>
  );
  const dropToDate = (date: string) => (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("task-id");
    if (id) updateTask({ id, planned_date: date });
  };
  const renderDateCell = (day: dayjs.Dayjs, dense = false) => {
    const key = day.format("YYYY-MM-DD");
    const items = dayTasks(day);
    return (
      <button
        key={key}
        className={`${dense ? "min-h-20" : "min-h-24"} rounded-lg bg-white/60 p-2 text-left shadow-sm dark:bg-white/5 ${selected === key ? "ring-2 ring-blue-500" : ""}`}
        onClick={() => setSelected(key)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropToDate(key)}
      >
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{calendarMode === "month" ? day.date() : day.format("MM-DD")}</span>
          {calendarMode === "month" && day.date() === 1 && (
            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {day.month() + 1}月
            </span>
          )}
          <span className="text-xs opacity-60">{items.length}</span>
        </div>
        {renderDots(items)}
      </button>
    );
  };
  return (
    <section className="flex flex-1 flex-col">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">日程</h1>
          <p className="text-sm opacity-65">月/周/日视图任务小圆点、点击查看、拖拽改期</p>
        </div>
        <div className="flex rounded-lg bg-white/60 p-1 text-sm dark:bg-white/10">
          {(["month", "week", "day"] as const).map((mode) => (
            <button
              key={mode}
              className={`rounded-md px-3 py-1.5 ${calendarMode === mode ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : ""}`}
              onClick={() => setCalendarMode(mode)}
            >
              {mode === "month" ? "月" : mode === "week" ? "周" : "日"}
            </button>
          ))}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,1fr)_minmax(280px,320px)] lg:gap-5">
        <div className={calendarMode === "day" ? "overflow-auto" : "grid grid-cols-7 gap-2 overflow-auto"}>
          {calendarMode === "month" && monthDays.map((day) => renderDateCell(day))}
          {calendarMode === "week" && weekDays.map((day) => renderDateCell(day, true))}
          {calendarMode === "day" && (
            <div
              className="min-h-full rounded-xl bg-white/50 p-5 dark:bg-white/5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropToDate(selected)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-60">{selectedDay.format("dddd")}</div>
                  <h2 className="text-2xl font-semibold">{selectedDay.format("YYYY-MM-DD")}</h2>
                </div>
                <div className="text-sm opacity-70">{selectedTasks.length} 项</div>
              </div>
              {renderDots(selectedTasks)}
              <div className="mt-5 grid gap-2">
                {selectedTasks.map((task) => (
                  <div key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData("task-id", task.id)} className="flex items-center gap-3 rounded-lg bg-white/70 p-3 text-sm dark:bg-slate-950/30">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: taskColor(task) }} />
                    <span className="min-w-0 flex-1">{task.title}</span>
                    <span className="text-xs opacity-60">{task.estimated_duration ? formatMinutes(task.estimated_duration) : "未估时"}</span>
                  </div>
                ))}
                {selectedTasks.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm opacity-60">这天还没有安排。</p>}
              </div>
            </div>
          )}
        </div>
        <aside className="min-w-0 rounded-xl bg-white/50 p-4 dark:bg-white/5">
          <h3 className="font-semibold">{selected}</h3>
          <p className="mt-1 text-sm opacity-70">工作负荷：预估 {formatMinutes(selectedTasks.reduce((sum, task) => sum + (task.estimated_duration ?? 0), 0))}</p>
          <div className="mt-4 space-y-2">
            {selectedTasks.map((task) => (
              <div key={task.id} className="rounded-lg bg-white/70 p-3 text-sm dark:bg-slate-950/30">
                {task.title}
              </div>
            ))}
            {selectedTasks.length === 0 && <p className="text-sm opacity-60">这天还没有安排。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function AiPanel({ embedded = false }: { embedded?: boolean }) {
  const { aiMessages, setAiOpen, sendAi } = useAppStore();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const streamBuffer = useRef("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shortcutSpeechTimer = useRef<number | null>(null);
  const speechNoticeTimer = useRef<number | null>(null);

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
          const delta = parsed.delta;
          useAppStore.getState().appendAiStream(delta);
        }),
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [aiMessages]);

  useEffect(() => {
    const onShortcut = () => {
      if (embedded && useAppStore.getState().aiOpen) return;
      inputRef.current?.focus();
      if (shortcutSpeechTimer.current) window.clearTimeout(shortcutSpeechTimer.current);
      shortcutSpeechTimer.current = window.setTimeout(() => startSpeech(), 200);
    };
    window.addEventListener(aiShortcutEventName, onShortcut);
    return () => {
      window.removeEventListener(aiShortcutEventName, onShortcut);
      if (shortcutSpeechTimer.current) window.clearTimeout(shortcutSpeechTimer.current);
      if (speechNoticeTimer.current) window.clearTimeout(speechNoticeTimer.current);
    };
  }, [embedded]);

  function resetSpeechState() {
    setListening(false);
    recognitionRef.current = null;
  }

  function showSpeechNotice(message: string) {
    setSpeechNotice(message);
    if (speechNoticeTimer.current) window.clearTimeout(speechNoticeTimer.current);
    speechNoticeTimer.current = window.setTimeout(() => setSpeechNotice(""), 1600);
  }

  function startSpeech() {
    if (listening || recognitionRef.current) return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert("当前浏览器不支持语音识别，请使用 Chrome 或 Edge");
      return;
    }
    const recognition = new SpeechRecognition();
    setSpeechNotice("");
    recognitionRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.onstart = () => setListening(true);
    recognition.onend = resetSpeechState;
    recognition.onerror = () => {
      setInput("语音识别失败，请手动输入");
      resetSpeechState();
    };
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      const message = text.trim();
      if (!message) {
        showSpeechNotice("未听到声音，请重试");
        return;
      }
      setInput(message);
      sendAi(message);
    };
    try {
      recognition.start();
    } catch {
      setInput("语音识别失败，请手动输入");
      resetSpeechState();
    }
  }

  return (
    <div className={embedded ? "ai-panel-host h-full min-h-0 overflow-hidden" : "fixed inset-0 z-30 flex items-end justify-end bg-slate-950/25 p-2 sm:p-6"} onClick={() => !embedded && setAiOpen(false)}>
      <aside className={`${embedded ? "ai-command-panel ai-command-panel-embedded" : "glass"} flex min-w-0 flex-col overflow-hidden rounded-lg p-4 ${embedded ? "h-full max-h-[300px] w-full" : "h-[min(620px,calc(100vh-16px))] w-full max-w-[420px]"}`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">AI助手</h2>
          {!embedded && <button className="icon-btn" onClick={() => setAiOpen(false)}>×</button>}
        </div>
        <div ref={listRef} className="ai-message-list min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
          {aiMessages.length === 0 ? (
            <div className="ai-guide-message">
              <span className="ai-guide-avatar"><Sparkles size={18} /></span>
              <span>今天想怎么安排？告诉我你想创建什么任务、开始什么计时。</span>
            </div>
          ) : (
            aiMessages.map((message, index) => (
              <div
                key={index}
                className={`rounded-lg p-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-8 bg-indigo-500 text-white"
                    : "mr-8 border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                }`}
              >
                {message.content || (message.role === "assistant" ? "正在思考..." : "")}
                {message.clarification && <div className="mt-2 rounded bg-amber-100 p-2 text-amber-900">{message.clarification}</div>}
              </div>
            ))
          )}
        </div>
        <form
          className="ai-input-bar mt-3 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.trim()) return;
            sendAi(input);
            setInput("");
          }}
        >
          <button
            className={`icon-btn ai-voice-button ${listening ? "ai-voice-button-listening animate-pulse" : ""}`}
            type="button"
            onClick={startSpeech}
            title={listening ? "正在听…" : speechNotice || "语音输入"}
          >
            <Mic size={18} />
            {(listening || speechNotice) && <span>{listening ? "正在听…" : speechNotice}</span>}
          </button>
          <input ref={inputRef} className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入或语音描述你想做的事..." />
          <button className="btn-primary" type="submit">发送</button>
        </form>
      </aside>
    </div>
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
    <section>
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
          className="btn-primary"
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
        {saved && <p className="text-sm text-emerald-600">已保存到本地设置。</p>}
        <div>
          <span className="mb-2 block text-sm font-medium">主题</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setTheme("light")}>浅色</button>
            <button className="btn-secondary" onClick={() => setTheme("dark")}>深色</button>
            <span className="self-center text-sm opacity-70">当前：{theme}</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/50 p-4 dark:bg-white/5">
          <span className="mb-3 block text-sm font-medium">全局快捷键</span>
          <div className="grid gap-3">
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
              <span className="opacity-70">AI 面板</span>
              <input className="field" value={shortcuts.toggle_ai} onChange={(event) => updateShortcut("toggle_ai", event.target.value)} />
            </label>
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
              <span className="opacity-70">显示/隐藏主窗口</span>
              <input className="field" value={shortcuts.toggle_window} onChange={(event) => updateShortcut("toggle_window", event.target.value)} />
            </label>
            <label className="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
              <span className="opacity-70">开始/暂停计时</span>
              <input className="field" value={shortcuts.toggle_timer} onChange={(event) => updateShortcut("toggle_timer", event.target.value)} />
            </label>
            <div className="flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={async () => {
                  setShortcutSaved(false);
                  setShortcutError("");
                  try {
                    const savedSettings = await import("./lib/api").then(({ api }) =>
                      api<typeof shortcuts>("update_shortcut_settings", { settings: shortcuts }),
                    );
                    setShortcuts(savedSettings);
                    setShortcutSaved(true);
                  } catch (error) {
                    setShortcutError(error instanceof Error ? error.message : "快捷键保存失败");
                  }
                }}
              >
                保存快捷键
              </button>
              {shortcutSaved && <span className="text-sm text-emerald-600">已更新</span>}
              {shortcutError && <span className="text-sm text-red-600">{shortcutError}</span>}
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
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm opacity-65">{subtitle}</p>
      </div>
    </header>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/60 p-3 dark:bg-slate-950/30">
      <div className="text-xs opacity-60">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-white/60 p-4 shadow-md dark:bg-white/5">
      <div className="text-sm opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default App;
