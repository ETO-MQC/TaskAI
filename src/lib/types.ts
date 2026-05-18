export type Priority = "high" | "medium" | "low";
export type Urgency = "urgent" | "not_urgent";
export type Importance = "important" | "not_important";
export type TaskStatus = "todo" | "done" | "archived";
export type TimerMode = "positive" | "pomodoro" | "countdown";
export type ReminderStatus = "pending" | "triggered" | "dismissed" | "snoozed";
export type MaterialStatus = "metadata_only" | "missing" | "queued" | "parsed" | "failed";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: Priority;
  urgency: Urgency;
  importance: Importance;
  quadrant: number;
  status: TaskStatus;
  deadline?: string | null;
  estimated_duration?: number | null;
  actual_total_duration: number;
  parent_id?: string | null;
  planned_date?: string | null;
  tags: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: Priority;
  urgency?: Urgency;
  importance?: Importance;
  status?: TaskStatus;
  deadline?: string | null;
  estimated_duration?: number | null;
  parent_id?: string | null;
  planned_date?: string | null;
  tags?: string[];
  sort_order?: number;
}

export interface TimerSnapshot {
  active: boolean;
  id?: string | null;
  task_id?: string | null;
  topic?: string | null;
  mode?: TimerMode | null;
  elapsed_seconds: number;
  remaining_seconds?: number | null;
  target_seconds?: number | null;
  paused: boolean;
}

export interface TimerRecord {
  id: string;
  task_id?: string | null;
  task_topic: string;
  mode: TimerMode;
  started_at: string;
  ended_at: string;
  duration: number;
  note?: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  task_id?: string | null;
  title: string;
  remind_at: string;
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
}

export interface ReminderInput {
  task_id?: string | null;
  title: string;
  remind_at: string;
}

export interface Material {
  id: string;
  name: string;
  path: string;
  file_type: string;
  size_bytes?: number | null;
  subject?: string | null;
  exam_type?: string | null;
  tags: string;
  note?: string | null;
  status: MaterialStatus;
  exists_on_disk: boolean;
  created_at: string;
  updated_at: string;
}

export interface PickedMaterial {
  name: string;
  path: string;
  file_type: string;
  size_bytes?: number | null;
}

export interface MaterialInput extends PickedMaterial {
  subject?: string | null;
  exam_type?: string | null;
  tags?: string[];
  note?: string | null;
  status?: MaterialStatus;
}

export interface MaterialPatch {
  id: string;
  subject?: string | null;
  exam_type?: string | null;
  tags?: string[];
  note?: string | null;
  status?: MaterialStatus;
}

export interface AiConversation {
  id: string;
  title: string;
  summary?: string | null;
  active_skill?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface AiConversationDetail {
  conversation: AiConversation;
  messages: AiConversationMessage[];
}

export interface AiPlanSnapshot {
  id: string;
  conversation_id: string;
  plan_json: string;
  created_at: string;
  updated_at: string;
}

export interface AiResponse {
  intent: string;
  action: string;
  data: Record<string, unknown>;
  needs_clarification: boolean;
  clarification: string | null;
  reply: string;
  executed?: boolean;
  created_tasks?: Task[];
  updated_task?: Task;
  timer?: TimerSnapshot;
}

export interface DashboardStats {
  today_minutes: number;
  today_timer_count: number;
  completed_today: number;
  open_tasks: number;
  total_tasks: number;
  weekly_completion_rate: number;
  monthly_completion_rate: number;
  quadrant_counts: Array<{ quadrant: number; count: number }>;
  trend: Array<{ day: string; minutes: number }>;
  ring_segments: Array<{ label: string; minutes: number; color: string }>;
}
