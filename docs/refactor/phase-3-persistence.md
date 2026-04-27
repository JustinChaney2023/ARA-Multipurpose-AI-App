# Phase 3 — SQLite Persistence & Patient Folders

**Status**: foundation laid alongside Phase 2; CRUD routes + UI still pending.
**Goal**: replace localStorage-only history with a durable local DB that models
patients, folders, raw inputs, summaries, and chat turns — and is ready for
Phase 4 RAG.

## What's already in place

- **DB connection**: [db/index.ts](../../services/local-ai/src/db/index.ts) —
  lazy `getDb()` opens `better-sqlite3` with WAL + `foreign_keys=ON`. Path comes
  from `config.db.path` (env `DB_PATH`), defaults to
  `services/local-ai/data/ara.db`. Parent dir auto-created.
- **Migrations runner**:
  [db/migrate.ts](../../services/local-ai/src/db/migrate.ts) — self-bootstraps
  `schema_migrations`, reads `.sql` files in lexical order from
  [db/migrations/](../../services/local-ai/src/db/migrations/), applies each
  inside a transaction. Idempotent (re-runs no-op).
- **Initial schema**:
  [db/migrations/001_initial.sql](../../services/local-ai/src/db/migrations/001_initial.sql)
  ships the Phase 2 `prompts` table alongside the full Phase 3 schema below
  (patients, folders, patient_folders, sessions, summaries, chat_turns,
  embeddings) plus the indexes. All Phase 3/4 tables exist in prod already —
  nothing to migrate when wiring CRUD.
- **Lifecycle**: `runMigrations()` + `seedDefaultPrompts()` run on service
  startup; `closeDb()` runs from the graceful-shutdown callback.

## Still TODO for this phase

- Patient / folder / session / summary CRUD endpoints + Zod request validation.
- Frontend patient sidebar + folder picker.
- Summary-write hook: after `/summarize` succeeds, persist the session + summary
  row with the prompt name and model used.
- Migrate existing localStorage history into the DB under an "Unassigned"
  patient on first run.

## Why SQLite (vs file-based JSON)

| Need                                                                    | SQLite wins                    | JSON wins          |
| ----------------------------------------------------------------------- | ------------------------------ | ------------------ |
| Patient folder hierarchy                                                | ✅ joins, indexes              | ⚠️ manual scans    |
| Longitudinal per-patient queries ("all notes about X in last 3 months") | ✅ indexed queries             | ⚠️ full reads      |
| RAG vector search                                                       | ✅ via `sqlite-vec` or similar | ❌ not practical   |
| Concurrent read/write safety                                            | ✅ transactions                | ⚠️ file-lock dance |
| Inspectability / backup                                                 | ⚠️ needs a client              | ✅ plain files     |
| Zero-setup                                                              | ⚠️ one plugin install          | ✅ nothing         |

The query and RAG requirements tip this decisively. **Decision: SQLite via
[`@tauri-apps/plugin-sql`](https://v2.tauri.app/plugin/sql/).**

Trade-offs accepted:

- Need a migration story (handled by the plugin's migration API).
- Loss of plain-text inspectability (acceptable — users don't browse the DB
  directly).

## Schema sketch (first cut)

```sql
-- A patient = a person the caregiver is documenting about.
CREATE TABLE patients (
  id           INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,       -- user-chosen label; NOT a legal PHI identifier
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Folders for organizing patients. Flat for now; nested later if asked for.
CREATE TABLE folders (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE patient_folders (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (patient_id, folder_id)
);

-- A session = one caregiver-input event (paste, upload, or audio).
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,         -- 'text' | 'ocr' | 'audio'
  raw_text   TEXT NOT NULL,         -- full input incl. sidetracks
  created_at TEXT NOT NULL
);

-- A summary is the AI output for a session. Immutable — re-summarize = new row.
CREATE TABLE summaries (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  prompt_name TEXT NOT NULL,        -- which prompt produced this, for audit
  model       TEXT NOT NULL,        -- e.g. 'qwen3:4b-q4_K_M'
  created_at  TEXT NOT NULL
);

-- Chat = free-form conversation about a patient (used by RAG in Phase 4).
CREATE TABLE chat_turns (
  id         INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,         -- 'user' | 'assistant'
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Embeddings for RAG. Blob layout decided in Phase 4.
CREATE TABLE embeddings (
  id           INTEGER PRIMARY KEY,
  source_kind  TEXT NOT NULL,       -- 'session.raw' | 'summary' | 'chat_turn'
  source_id    INTEGER NOT NULL,
  vector       BLOB NOT NULL,
  model        TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_sessions_patient_created ON sessions(patient_id, created_at);
CREATE INDEX idx_summaries_session        ON summaries(session_id);
CREATE INDEX idx_chat_turns_patient       ON chat_turns(patient_id, created_at);
CREATE INDEX idx_embeddings_source        ON embeddings(source_kind, source_id);
```

HIPAA note: `display_name` is a user-chosen label, not a legal identifier. The
same PHI rules from the current app apply — real PHI fields (names, DOB,
identifiers) are still manually entered by the user in the form path and not
written to logs.

## Where persistence lives

**Decided 2026-04-22: service-owned.** The SQLite file lives with
`services/local-ai`; the frontend accesses it exclusively through service
endpoints. `@tauri-apps/plugin-sql` will **not** be used — the plugin would
force the DB into Tauri appdata, splitting data from where the LLM runs.

Chosen because:

- Phase 4 RAG wants the LLM and the vector store co-located (no extra IPC on
  every retrieval).
- Web dev mode (`npm run dev:web`) keeps working — no Tauri required.
- One place to back up (the service's data directory).

Trade-off accepted: the service is no longer stateless. We'll add a data
directory to its config and ship migrations with the service.

Implementation sketch:

- SQLite driver: `better-sqlite3` (synchronous, fast, well-supported on Node
  18+).
- DB file location: `services/local-ai/data/ara.db`, overridable via `DB_PATH`
  env var.
- Migrations: simple numbered `.sql` files in
  `services/local-ai/src/db/migrations/`, applied on startup in order.

## UI additions

- Sidebar / panel: patient list, grouped by folder. Pick a patient → their
  sessions/summaries/chat.
- "New patient" + "New folder" actions.
- Existing QuickHistory / HistoryPanel refactored or replaced.

## Migration from current localStorage

- On first run after Phase 3 ships, read existing `utils/history.ts`
  localStorage entries and import them as sessions under a "Unassigned" patient.
  Log the migration. Keep localStorage for one version as a fallback, then
  retire.

## Non-goals for Phase 3

- No RAG wiring yet (that's Phase 4 — but the `embeddings` table ships here so
  Phase 4 has a place to write).
- No multi-device / cloud sync.
- No nested folders (flat `folders` + `patient_folders` many-to-many is enough;
  nest later by adding `parent_id` if asked).

## Open questions

- Tauri-owned vs service-owned DB (see table above).
- Do we keep the localStorage history forever as a fallback, or retire it after
  one release?
- Legal-identifier linkage: do we want an `external_id` column on `patients` for
  case numbers, or strictly keep those out of the DB per HIPAA? **Leaning: keep
  out of DB. Case numbers live on the exported PDF only.**
