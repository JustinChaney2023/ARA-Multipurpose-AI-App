-- Migration 001: initial schema
--
-- Covers both Phase 2 (editable prompts) and the Phase 3 baseline tables
-- (patients, folders, sessions, summaries, chat_turns, embeddings). Shipping
-- the whole first-cut schema in one migration keeps the history clean and
-- matches docs/refactor/phase-3-persistence.md.
--
-- Conventions:
-- - All timestamps are ISO 8601 strings (TEXT) so they survive JSON boundaries
--   without a conversion step.
-- - Foreign keys cascade on delete because orphaned children serve no purpose
--   in a single-user local app.

-- Prompts the app uses. `name` is the canonical key (e.g. "summarizer.main").
-- `body` is the currently-active text; `default_body` is the factory version
-- for one-click reset. Storing the default here (instead of hard-coded) makes
-- it easy to surface it in the UI as a "preview" next to the editor.
CREATE TABLE prompts (
  name         TEXT PRIMARY KEY,
  body         TEXT NOT NULL,
  default_body TEXT NOT NULL,
  description  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- A patient = a person the caregiver is documenting about. `display_name` is
-- a user-chosen label, not a legal PHI identifier — real identifiers stay off
-- disk (entered on the PDF export step only).
CREATE TABLE patients (
  id           INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Flat folder list for now. If users ask for nesting later, add parent_id.
CREATE TABLE folders (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Many-to-many: a patient can sit in multiple folders.
CREATE TABLE patient_folders (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (patient_id, folder_id)
);

-- A session = one caregiver-input event (paste, file upload, or audio). The
-- raw_text column holds the full input including any non-clinical chatter so
-- nothing is discarded at intake; the summarizer decides what to surface.
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,
  raw_text   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A summary is an immutable AI output tied to a session. Re-summarizing the
-- same session creates a new row rather than overwriting so we can audit how
-- outputs shifted as prompts or models changed.
CREATE TABLE summaries (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  prompt_name TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Free-form chat about a patient. Phase 4 RAG will retrieve from here.
CREATE TABLE chat_turns (
  id         INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Vectors for RAG. BLOB layout (Float32Array raw bytes) is decided in Phase 4
-- but the table ships now so Phase 4 doesn't need another migration.
CREATE TABLE embeddings (
  id          INTEGER PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_id   INTEGER NOT NULL,
  vector      BLOB NOT NULL,
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_sessions_patient_created ON sessions(patient_id, created_at);
CREATE INDEX idx_summaries_session        ON summaries(session_id);
CREATE INDEX idx_chat_turns_patient       ON chat_turns(patient_id, created_at);
CREATE INDEX idx_embeddings_source        ON embeddings(source_kind, source_id);
