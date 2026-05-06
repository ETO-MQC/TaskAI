PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  urgency TEXT NOT NULL DEFAULT 'not_urgent' CHECK (urgency IN ('urgent', 'not_urgent')),
  importance TEXT NOT NULL DEFAULT 'not_important' CHECK (importance IN ('important', 'not_important')),
  quadrant INTEGER NOT NULL CHECK (quadrant BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'archived')),
  deadline TEXT,
  estimated_duration REAL,
  actual_total_duration REAL NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  planned_date TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_quadrant ON tasks(quadrant);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS timer_records (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  task_topic TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('positive', 'pomodoro', 'countdown')),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration REAL NOT NULL CHECK (duration >= 0),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timer_records_task_id ON timer_records(task_id);
CREATE INDEX IF NOT EXISTS idx_timer_records_started_at ON timer_records(started_at);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at);

CREATE TABLE IF NOT EXISTS user_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO user_settings (key, value, updated_at) VALUES
  ('pomodoro_focus_minutes', '25', datetime('now')),
  ('pomodoro_break_minutes', '5', datetime('now')),
  ('pomodoro_long_break_minutes', '20', datetime('now')),
  ('pomodoro_rounds', '4', datetime('now')),
  ('daily_target_hours', '6', datetime('now')),
  ('theme', 'light', datetime('now')),
  ('notifications_enabled', 'true', datetime('now')),
  ('deepseek_api_key', '', datetime('now'));
