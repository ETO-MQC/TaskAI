PRAGMA foreign_keys = ON;

-- Study Projects / Plan Groups
CREATE TABLE IF NOT EXISTS study_projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    subject TEXT,
    exam_type TEXT,
    exam_date TEXT,
    daily_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    description TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_projects_status ON study_projects(status);
CREATE INDEX IF NOT EXISTS idx_study_projects_subject ON study_projects(subject);

-- Add study_project_id to tasks (nullable, backward-compatible)
-- SQLite does not support IF NOT EXISTS for columns, so we use a workaround:
-- The migration will fail silently if the column already exists.
-- Since sqlx::migrate! runs each migration exactly once, this is safe.
ALTER TABLE tasks ADD COLUMN study_project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_study_project_id ON tasks(study_project_id);
