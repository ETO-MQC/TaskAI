import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CirclePlay,
  Clock3,
  ListTodo,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Trash2,
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
import type { Importance, Priority, Task, TimerMode, Urgency } from "./lib/types";
import {
  formatMinutes,
  formatSeconds,
  modeLabel,
  parseTags,
  priorityLabel,
  quadrantColors,
  quadrantLabels,
  timerColors,
} from "./lib/domain";

const navItems = [
  { id: "tasks", label: "任务", icon: ListTodo },
  { id: "timer", label: "计时", icon: Clock3 },
  { id: "calendar", label: "日程", icon: CalendarDays },
  { id: "stats", label: "统计", icon: BarChart3 },
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
          useAppStore.setState((state) => ({ aiOpen: !state.aiOpen }));
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

  return (
    <div className="h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34%),linear-gradient(135deg,#f8fafc,#eef2ff_50%,#fefce8)] p-4 text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,#1e3a8a,transparent_32%),linear-gradient(135deg,#181825,#111827_52%,#27272a)] dark:text-slate-100">
      <div className="flex h-full gap-4">
        <Sidebar />
        <main className="glass flex min-w-0 flex-1 flex-col rounded-xl p-5">
          {store.view === "tasks" && <TasksView />}
          {store.view === "timer" && <TimerView />}
          {store.view === "calendar" && <CalendarView />}
          {store.view === "stats" && <StatsView />}
          {store.view === "settings" && <SettingsView />}
        </main>
      </div>
      <button
        className="fixed bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-white shadow-glow transition hover:scale-105 dark:bg-white dark:text-slate-950"
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
    <aside className="glass flex w-16 flex-col items-center gap-3 rounded-xl py-4 transition-all duration-300 hover:w-[220px]">
      <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white dark:bg-white dark:text-slate-950">
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
            className={`group flex h-11 w-[calc(100%-16px)] items-center justify-center gap-3 rounded-lg transition hover:bg-white/70 dark:hover:bg-white/10 ${
              active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : ""
            }`}
          >
            <Icon size={20} />
            <span className="hidden whitespace-nowrap text-sm font-medium group-hover:inline">
              {item.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function TasksView() {
  const { tasks, selectedTaskId, selectTask } = useAppStore();
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  return (
    <section className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="任务列表" subtitle="未完成 / 已完成 / 四象限" />
        <TaskForm />
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto pr-1">
          {[1, 2, 3, 4].map((quadrant) => (
            <QuadrantColumn
              key={quadrant}
              quadrant={quadrant}
              tasks={tasks.filter((task) => task.quadrant === quadrant && task.status !== "archived")}
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
      className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2"
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
        className="field col-span-2 min-h-16"
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
  return (
    <div className="rounded-lg border border-white/30 bg-white/44 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: quadrantColors[quadrant] }}>
          Q{quadrant} {quadrantLabels[quadrant]}
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
    <div className="group rounded-lg bg-white/70 p-3 text-sm shadow-sm transition hover:-translate-y-0.5 dark:bg-slate-950/30" onClick={onSelect}>
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
  const records = useAppStore((state) => state.records.filter((record) => record.task_id === task?.id));
  if (!task) {
    return <aside className="w-[360px] rounded-xl border border-dashed border-slate-300 p-5 opacity-70">还没有任务，对 AI 说一句话试试看。</aside>;
  }
  return (
    <aside className="flex w-[380px] flex-col overflow-auto rounded-xl border border-white/30 bg-white/46 p-5 dark:border-white/10 dark:bg-white/5">
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
  const { timer, startTimer, pauseTimer, resetTimer, stopTimer } = useAppStore();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [topic, setTopic] = useState("自由专注");
  const [minutes, setMinutes] = useState("25");
  const color = timerColors[timer.mode ?? mode];
  const elapsed = timer.elapsed_seconds;
  const target = timer.target_seconds ?? (mode === "positive" ? Math.max(3600, elapsed || 3600) : Number(minutes) * 60);
  const progress = timer.mode === "positive" ? Math.min(100, (elapsed / target) * 100) : Math.min(100, ((target - (timer.remaining_seconds ?? target)) / target) * 100);
  const displaySeconds = timer.mode === "positive" || !timer.remaining_seconds ? elapsed : timer.remaining_seconds;

  return (
    <section className="flex flex-1 flex-col">
      <Header title="专注计时" subtitle="Rust 后端 Instant 管理起止时间，前端消费后端秒级状态" />
      <div className="grid flex-1 place-items-center">
        <div className="flex w-full max-w-4xl flex-col items-center gap-6">
          <div className="flex gap-2">
            {(["positive", "pomodoro", "countdown"] as TimerMode[]).map((item) => (
              <button
                key={item}
                className={`rounded-lg px-4 py-2 text-sm ${mode === item ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-white/60 dark:bg-white/10"}`}
                onClick={() => setMode(item)}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>
          <div
            className={`relative grid h-72 w-72 place-items-center rounded-full ${timer.paused ? "outline-dashed outline-2 outline-offset-4" : ""}`}
            style={{
              background: `conic-gradient(${color} ${progress * 3.6}deg, rgba(148,163,184,.22) 0deg)`,
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
          <div className="grid w-full max-w-2xl grid-cols-[1fr_120px] gap-2">
            <input className="field" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="当前专注主题" />
            <input className="field" value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" min="1" />
          </div>
          <div className="flex gap-3">
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
            托盘动态进度环使用 Tauri tray-icon API 与 base64 图标更新实现；Linux 作为已知限制记录在 Sprint 8。
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
  const data = stats?.quadrant_counts ?? [];
  const trend = stats?.trend ?? [];
  const ringSegments = stats?.ring_segments ?? [];
  const total = Math.max(1, ringSegments.reduce((sum, item) => sum + item.minutes, 0));
  const hasRingData = ringSegments.some((item) => item.minutes > 0);
  let offset = 0;
  return (
    <section className="flex flex-1 flex-col">
      <Header title="今日数据" subtitle="日环进度圈、四象限饼图、趋势折线图、统计卡片" />
      <div className="grid flex-1 grid-cols-2 gap-5 overflow-auto">
        <div className="rounded-xl bg-white/50 p-5 dark:bg-white/5">
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
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="本周完成率" value={`${Math.round(stats?.weekly_completion_rate ?? 0)}%`} />
          <StatCard label="本月完成率" value={`${Math.round(stats?.monthly_completion_rate ?? 0)}%`} />
          <StatCard label="未完成任务" value={stats?.open_tasks ?? 0} />
          <StatCard label="今日完成" value={stats?.completed_today ?? 0} />
          <StatCard label="总任务" value={stats?.total_tasks ?? 0} />
          <div className="col-span-3 h-64 rounded-xl bg-white/50 p-4 dark:bg-white/5">
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
        <div className="col-span-2 h-72 rounded-xl bg-white/50 p-4 dark:bg-white/5">
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
        className={`${dense ? "min-h-20" : "min-h-24"} rounded-lg bg-white/50 p-2 text-left dark:bg-white/5 ${selected === key ? "ring-2 ring-blue-500" : ""}`}
        onClick={() => setSelected(key)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropToDate(key)}
      >
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{calendarMode === "month" ? day.date() : day.format("MM-DD")}</span>
          <span className="text-xs opacity-60">{items.length}</span>
        </div>
        {renderDots(items)}
      </button>
    );
  };
  return (
    <section className="flex flex-1 flex-col">
      <header className="mb-4 flex items-end justify-between">
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
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-5">
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
        <aside className="rounded-xl bg-white/50 p-4 dark:bg-white/5">
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

function AiPanel() {
  const { aiMessages, setAiOpen, sendAi } = useAppStore();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const streamBuffer = useRef("");

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

  function startSpeech() {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setInput(text);
      if (text) sendAi(text);
    };
    recognition.start();
  }

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/25" onClick={() => setAiOpen(false)}>
      <aside className="glass absolute bottom-6 right-6 flex h-[620px] w-[420px] flex-col rounded-xl p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">AI助手</h2>
          <button className="icon-btn" onClick={() => setAiOpen(false)}>×</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {aiMessages.map((message, index) => (
            <div key={index} className={`rounded-lg p-3 text-sm ${message.role === "user" ? "ml-12 bg-blue-600 text-white" : "mr-12 bg-white/70 dark:bg-slate-950/40"}`}>
              {message.content}
              {message.clarification && <div className="mt-2 rounded bg-amber-100 p-2 text-amber-900">{message.clarification}</div>}
            </div>
          ))}
        </div>
        <form
          className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.trim()) return;
            sendAi(input);
            setInput("");
          }}
        >
          <button className={`icon-btn ${listening ? "bg-red-500 text-white" : ""}`} type="button" onClick={startSpeech} title="语音输入">
            <Mic size={18} />
          </button>
          <input className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入或语音描述任务" />
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
            <label className="grid grid-cols-[150px_1fr] items-center gap-3 text-sm">
              <span className="opacity-70">AI 面板</span>
              <input className="field" value={shortcuts.toggle_ai} onChange={(event) => updateShortcut("toggle_ai", event.target.value)} />
            </label>
            <label className="grid grid-cols-[150px_1fr] items-center gap-3 text-sm">
              <span className="opacity-70">显示/隐藏主窗口</span>
              <input className="field" value={shortcuts.toggle_window} onChange={(event) => updateShortcut("toggle_window", event.target.value)} />
            </label>
            <label className="grid grid-cols-[150px_1fr] items-center gap-3 text-sm">
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
    <header className="mb-4 flex items-end justify-between">
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
    <div className="rounded-xl bg-white/50 p-4 dark:bg-white/5">
      <div className="text-sm opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default App;
