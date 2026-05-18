PRAGMA foreign_keys = ON;

ALTER TABLE ai_conversations RENAME TO ai_legacy_messages;

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  summary TEXT,
  active_skill TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ai_plan_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL UNIQUE REFERENCES ai_conversations(id) ON DELETE CASCADE,
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_ai_conversations_updated_at ON ai_conversations(updated_at);
CREATE INDEX idx_ai_messages_conversation_id_created_at ON ai_messages(conversation_id, created_at);

INSERT INTO ai_conversations (id, title, summary, active_skill, created_at, updated_at)
SELECT
  'legacy-import',
  '历史导入对话',
  '由旧版消息记录迁移',
  NULL,
  (SELECT MIN(created_at) FROM ai_legacy_messages),
  (SELECT MAX(created_at) FROM ai_legacy_messages)
WHERE EXISTS (SELECT 1 FROM ai_legacy_messages);

INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
SELECT id, 'legacy-import', role, content, created_at
FROM ai_legacy_messages
WHERE EXISTS (SELECT 1 FROM ai_legacy_messages);
