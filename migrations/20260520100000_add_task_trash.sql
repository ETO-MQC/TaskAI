-- Add trash support: trashed_at and trash_reason fields
-- These fields enable soft-delete with a recycle bin mechanism.
-- Tasks with trashed_at IS NULL are normal tasks.
-- Tasks with trashed_at IS NOT NULL are in the trash.
-- Safe to run on empty DB and existing DB; only adds nullable columns.

ALTER TABLE tasks ADD COLUMN trashed_at TEXT;
ALTER TABLE tasks ADD COLUMN trash_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_trashed_at ON tasks(trashed_at);
