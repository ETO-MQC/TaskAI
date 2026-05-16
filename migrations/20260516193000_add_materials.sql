PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  path TEXT NOT NULL CHECK (length(trim(path)) > 0),
  file_type TEXT NOT NULL,
  size_bytes INTEGER,
  subject TEXT,
  exam_type TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'metadata_only'
    CHECK (status IN ('metadata_only', 'missing', 'queued', 'parsed', 'failed')),
  exists_on_disk INTEGER NOT NULL DEFAULT 1 CHECK (exists_on_disk IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON materials(subject);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at);
