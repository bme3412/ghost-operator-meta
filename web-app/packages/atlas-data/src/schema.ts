/** Atlas's own schema. Saltbreak's business tables live in a separate database. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS functions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  responsibilities TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  function_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  inputs TEXT NOT NULL DEFAULT '[]',
  outputs TEXT NOT NULL DEFAULT '[]',
  evidence_status TEXT NOT NULL DEFAULT 'described'
);

CREATE TABLE IF NOT EXISTS edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  evidence TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (from_id, to_id, type)
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  actor_mode TEXT NOT NULL DEFAULT 'human',
  app_scope TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS recording_events (
  recording_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  value TEXT,
  screenshot_ref TEXT,
  actor TEXT NOT NULL DEFAULT 'human',
  PRIMARY KEY (recording_id, sequence)
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS skill_versions (
  skill_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  recipe_json TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (skill_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  skill_version INTEGER NOT NULL,
  pinned_inputs TEXT NOT NULL DEFAULT '[]',
  operation_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS step_attempts (
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  actions TEXT NOT NULL DEFAULT '[]',
  observed_outcome TEXT NOT NULL DEFAULT '',
  passed INTEGER,
  PRIMARY KEY (run_id, step_id, attempt)
);

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  file_ref TEXT NOT NULL,
  input_versions TEXT NOT NULL DEFAULT '{}',
  producer_run TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, version)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'detected',
  hypothesis TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
