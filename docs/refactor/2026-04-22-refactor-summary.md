# ARA Refactor Summary — 2026-04-22

> **Purpose:** One-document briefing on what changed, why, and where we stand.
> Covers the full arc from the old form-first pipeline to the new summary-first
> architecture, including what shipped today in the final cleanup pass.

---

## 1. Executive Summary

**The app pivoted from "OCR → rigid form → fillable PDF" to "text in → AI
summary out."**

The old pipeline tried to force unstructured caregiver notes into a strict MCCMC
form field-by-field. That was brittle, slow, and produced output that still
needed heavy manual cleanup. The new model treats the LLM as a writing
assistant: paste notes (or drop a file), get back a clean narrative summary
written in the voice of a care coordinator. The structured form still exists as
an opt-in path for users who prefer it.

**What shipped today (final cleanup pass):**

- Zero ESLint errors across the monorepo; builds and typechecks pass in all 3
  workspaces.
- Prompts auto-sync to new code defaults when a user has never customized them.
- `formToRawText()` now includes SIH/HCBW service type when generating a summary
  from the structured form.
- Removed dead parameter `_ocrConfidence` from the `/extract/fill` API.
- CSS deduplicated (543 redundant lines removed).
- All env vars documented in `.env.example`.
- **React error boundary** added — catches render crashes and shows a reloadable
  fallback instead of white-screening.
- **Keyboard shortcuts deduplicated** — removed duplicate `useKeyboardShortcuts`
  from `utils/keyboard.ts` (kept `COMMON_SHORTCUTS` and `formatShortcut` for
  `ShortcutsHelp.tsx`).
- **SettingsScreen dirty-state guard** — switching prompts with unsaved changes
  now shows a browser confirm dialog.
- **`sanitizeRequest` middleware mounted** — XSS sanitization for query params
  is now active in the request pipeline.
- **`chat_turns` CRUD endpoints wired** — `GET /patients/:id/chat-turns`,
  `POST /chat-turns`, `DELETE /chat-turns/:id` make the table functional for
  Phase 4 chat/RAG.

---

## 2. Before vs. After

|                     | **Before (pre-refactor)**                | **After (now)**                                            |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| **Primary output**  | Fillable PDF with rigid form fields      | Clean narrative summary (paragraph prose)                  |
| **Input handling**  | File upload only; manual form fill       | Text paste, file upload (OCR), or structured form          |
| **LLM role**        | Extractor — force text into form schema  | Writer — synthesize notes into prose                       |
| **Prompts**         | Hard-coded in source                     | Editable in SQLite; user can tune via Settings             |
| **Persistence**     | localStorage only (fragile, unqueryable) | SQLite: patients, folders, sessions, summaries, embeddings |
| **Patient context** | None — every summary is standalone       | RAG pulls prior visits for the same patient                |
| **Export**          | PDF is the headline                      | Copy/paste plain text; PDF is secondary (form path only)   |

---

## 3. Architecture — Current State

### 3.1 Tech Stack

| Layer               | Tech                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| Desktop UI          | Tauri v1.5 + React 18 + TypeScript 5.3 + Vite 5                              |
| Local AI Service    | Node.js 20 + Express + better-sqlite3                                        |
| OCR                 | tesseract.js (images) + pdf-parse / pdf2pic (PDFs)                           |
| LLM                 | Ollama (`qwen3:4b-q4_K_M` for generation, `nomic-embed-text` for embeddings) |
| Schema / Validation | Zod                                                                          |
| Build / Test        | Vite + Vitest                                                                |

### 3.2 Monorepo Layout

```
ara-caregiver-assistant/
├── apps/desktop/          # Tauri + React frontend
├── services/local-ai/     # Express API (OCR, LLM, DB, RAG)
└── packages/shared/       # Zod schemas, types, utilities
```

### 3.3 Data Flow (Primary Path)

```
User Input (paste / file drop)
    ↓
[Frontend] ImportScreen
    ↓ POST /summarize  or  POST /summarize/file
[Backend] OCR (if file) → RAG context lookup (if patient selected)
    ↓
[Backend] summarizeCaregiverNotes()
    - Loads editable prompts from SQLite
    - Streams from Ollama with think:false
    - Progress tracked via /progress/SUMMARIZE polling
    ↓
[Backend] Persist session + summary in SQLite
    - Background: embed raw text + summary for future RAG
    ↓
[Frontend] SummaryScreen
    - AI summary (primary)
    - Collapsible original input (nothing lost)
    - Copy to clipboard
```

### 3.4 Opt-In Form Path

```
"Fill form manually" button on ImportScreen
    ↓
ReviewScreen (structured MCCMC form editor)
    - Header fields, SIH/HCBW checkboxes, 6 narrative textareas, signature
    - Undo/redo, validation, auto-format dates
    - "Generate Summary" button converts form → synthetic notes → /summarize
    - PDF export (fillable) available
```

---

## 4. What Changed — Phase by Phase

### Phase 1 — Summary-Primary Review Surface _(shipped)_

**Goal:** Make the summary the default output. Keep the form reachable via a
button.

**Changes:**

- Added `SummaryScreen.tsx` — displays AI summary with minimal Markdown
  rendering (`**bold**` + paragraphs).
- Changed `ImportScreen` default post-submit route from `ReviewScreen` →
  `SummaryScreen`.
- Added "Fill form manually" button that routes to `ReviewScreen` with an empty
  form.
- Rewrote summarizer prompts in `services/local-ai/src/defaults/prompts.ts`:
  - **System prompt:** caregiver persona, fact-only constraint, no inference, no
    headings/bullets.
  - **Main prompt:** template with `{{rawText}}` and `{{context}}` placeholders;
    lists 10 topics to weave into prose (service type, setting, presentation,
    health, services, progress, interpersonal, staff input, follow-up,
    conclusion).
- Swapped model to `qwen3:4b-q4_K_M` with `think: false` (disables qwen3
  reasoning mode that burned 30–90s on invisible tokens).
- Enabled streaming so the progress bar tracks real tokens (30% → 89%) instead
  of freezing.
- Timeout bumped to 300s, `num_predict: 900` for CPU-only coverage.

### Phase 2 — Editable Prompts _(shipped)_

**Goal:** Let users view, edit, save, and restore the prompts the LLM uses.

**Changes:**

- SQLite `prompts` table: `name PK`, `body`, `default_body`, `description`,
  `updated_at`.
- `defaults/prompts.ts` ships factory defaults. `seedDefaultPrompts()` runs on
  startup:
  - Inserts missing prompts.
  - Updates `default_body`/`description` to match code changes.
  - **Auto-syncs active `body`** when `body === old default` (user never
    customized).
- `promptStore.ts`: `getPromptBody()`, `render(template, vars)` with
  `{{placeholder}}` substitution.
- API: `GET /prompts`, `GET /prompts/:name`, `PUT /prompts/:name`,
  `POST /prompts/:name/reset`.
- UI: `SettingsScreen.tsx` — header button, left-rail prompt picker, textarea
  editor, variable chips, collapsible factory-default preview.

### Phase 3 — SQLite Persistence _(foundation shipped; CRUD wired)_

**Goal:** Replace localStorage-only history with a queryable local database.

**Changes:**

- `better-sqlite3` with WAL mode + `foreign_keys=ON`.
- Migrations runner (`db/migrate.ts`) applies numbered `.sql` files in lexical
  order.
- Schema (`001_initial.sql`) creates:
  - `patients`, `folders`, `patient_folders` (many-to-many)
  - `sessions` (raw input events), `summaries` (AI output, immutable)
  - `chat_turns` (placeholder for Phase 4 chat)
  - `embeddings` (Float32Array BLOBs for RAG)
- **All CRUD endpoints wired:**
  - Patients: `GET /patients`, `POST /patients`, `GET /patients/:id`,
    `PUT /patients/:id`, `DELETE /patients/:id`
  - Folders: `GET /folders`, `POST /folders`, `PUT /folders/:id`,
    `DELETE /folders/:id`
  - Links: `POST /patients/:id/folders`,
    `DELETE /patients/:id/folders/:folderId`
  - Sessions: `GET /patients/:id/sessions`, `POST /sessions`,
    `GET /sessions/:id`, `DELETE /sessions/:id`
  - Summaries: `GET /sessions/:id/summaries`, `GET /summaries/:id`
  - Migration: `POST /migrate/localstorage`
- **Auto-persistence on /summarize:** when `patientId` is provided, creates
  `session` + `summary` rows automatically.
- `PatientSidebar.tsx` in frontend: collapsible patient list with inline
  create/delete.
- localStorage → DB migration utility in frontend (`utils/migration.ts`).

**Key decision:** Service-owned SQLite (not Tauri-plugin). The DB lives with
`services/local-ai` so the LLM and vector store are co-located. Path:
`services/local-ai/data/ara.db`, overridable via `DB_PATH`.

### Phase 4 — RAG Over Prior Notes _(shipped)_

**Goal:** When summarizing about a patient, inject relevant context from their
prior visits.

**Changes:**

- Embedding model: `nomic-embed-text` via Ollama (768 dims, local, fast on CPU).
  Configurable via `EMBED_MODEL` env var.
- `POST /embed` — embed arbitrary text.
- `POST /rag/query` — retrieve top-K snippets for a patient + query.
- `ragStore.ts` — patient-scoped in-memory cosine similarity. Loads all patient
  embeddings into JS, computes similarity, returns top K. Explicitly documented
  as fine for "a few hundred records per patient; move to sqlite-vec if corpus
  grows."
- `queryRagContext()` injects retrieved snippets into the `{{context}}`
  placeholder in both system and user prompts.
- **Fire-and-forget embedding:** after `/summarize` persists session + summary,
  `embedSessionAndSummary()` runs in background with `.catch(() => {})` —
  non-fatal.

---

## 5. Code Quality & Cleanup (Today's Pass)

### ESLint

- Fixed `.eslintrc.cjs` plugin references (was using deprecated string format).
- Clean `npm ci` install resolved dependency mismatches.
- **Result: 0 errors, 542 warnings.** Warnings are mostly `no-unsafe-*` from
  `response.json()` typed as `any`, `no-misused-promises` in React event
  handlers, and `prefer-nullish-coalescing`.

### Dead code removal

- Removed unused `getPDFPageCount()` from `ocr.ts`.
- Removed unused imports from `ollama.ts` (`MonthlyCareCoordinationFormSchema`,
  `Errors`, `AppError`).
- Removed unused `operationStages` from `logger.ts`.
- Removed unused `getErrorMessage` import from `errorHandler.ts`.
- Removed unused `AppError` import from `middleware/validation.ts`.
- Removed `_ocrConfidence` dead parameter from `ExtractFillSchema` and
  `/extract/fill` handler.

### Bug fixes

- `ReviewScreen`: `formToRawText()` now includes SIH/HCBW service type so
  "Generate Summary" from the form doesn't lose that context.
- `ReviewScreen`: Fixed `NodeJS.Timeout` → `ReturnType<typeof setTimeout>` for
  browser compatibility.
- `ReviewScreen`: Fixed date-change race condition (restructured
  `handleDateChange`).
- `ReviewScreen`: Delayed `URL.revokeObjectURL` by 1s for Safari blob stability.
- `config/index.ts`: Added missing `embedModel` to Zod schema.
- `patientStore.ts`: Fixed `ValidationIssue` type to include optional `field`.
- Env docs: Added missing vars (`EMBED_MODEL`, `HOST`, `TESSERACT_LANG_PATH`,
  `PROGRESS_TTL`, etc.) to both `.env.example` files.

### CSS

- Deduplicated `styles.css`: removed 543-line redundant first half (1517 → 974
  lines).

### Config centralization

- `EMBED_MODEL` now read via `config.ollama.embedModel` in `rag.ts` and `/embed`
  endpoint.
- `promptStore.ts` auto-syncs uncustomized prompts to new code defaults.

---

## 6. Deep Think — What Makes Sense, What Doesn't

### 6.1 What's Working Well

1. **The summary-first UX is the right call.** Care coordinators think in
   narrative, not form fields. The old pipeline spent enormous effort (LLM Q&A,
   repair loops, validation) to produce something that still needed human
   rewriting. The new flow is simpler and the output is immediately usable.

2. **Editable prompts are high-leverage.** ARA can tune the summary voice,
   length, and emphasis without a code change. The auto-sync logic preserves
   user edits while keeping factory defaults current.

3. **Patient-scoped RAG is architecturally sound.** Keeping vectors isolated per
   patient is a HIPAA-safer default. The in-memory similarity approach is
   correct for the expected data size (dozens to hundreds of sessions per
   patient).

4. **Service-owned SQLite was the right trade-off.** Co-locating the DB with the
   LLM service eliminates IPC overhead for RAG and keeps web dev mode
   (`npm run dev:web`) working without Tauri.

5. **The opt-in form path is well-contained.** Everything from `narrativeQA.ts`
   to `pdfGenerator.ts` still works when triggered. It doesn't clutter the
   primary flow.

### 6.2 What's Confusing or Broken

1. **Vision-LLM flag in `/extract/pdf` is computed but never used.** The code
   sets `useVision = isImage && poorOcr` but then always calls
   `fillNarrativeWithQA(ocrResult.text)`. The multimodal handwriting path from
   the architecture docs is partially wired but not executed.

2. **Auto-save only writes to localStorage, not SQLite.** If the browser clears
   storage, drafts are lost. The `useAutoSave` hook should eventually write
   drafts to a `drafts` table or at least tie into the session model.

3. **No React error boundaries for individual screens.** The top-level boundary
   catches crashes, but smaller boundaries around async-heavy components
   (ImportScreen, ReviewScreen) would provide more granular recovery.

### 6.3 Recommendations (Next Sprint)

| Priority   | Item                                     | Why                                                         |
| ---------- | ---------------------------------------- | ----------------------------------------------------------- |
| **Medium** | Connect auto-save to SQLite              | Durability; localStorage is not a database                  |
| **Medium** | Finish vision-LLM path in `/extract/pdf` | Handwriting OCR is a stated goal; current code is 90% there |
| **Low**    | Add per-screen error boundaries          | Granular recovery instead of full-app reload                |
| **Low**    | Frontend chat UI                         | Wire `POST /chat-turns` into a chat panel per patient       |

---

## 7. Demo Script (For the Meeting)

If you want to walk someone through the app, here's a 3-minute flow:

1. **Start the service** (`npm run dev:service` on port 3002) and the desktop
   app (`npm run dev:web`).
2. **Paste caregiver notes** into the textarea on ImportScreen → Submit.
3. **Watch the SummaryScreen** appear with a clean narrative paragraph. Expand
   "Original input" to show nothing was lost.
4. **Open Settings** (header button) → edit the `summarizer.main` prompt → save.
5. **Submit new notes** — the summary now reflects the edited prompt.
6. **Create a patient** in the sidebar → select them → submit notes.
7. **Check the DB** (`sqlite3 services/local-ai/data/ara.db`) — `sessions` and
   `summaries` rows exist.
8. **Submit a second note** for the same patient — the summary implicitly
   includes RAG context from the first visit.
9. **Click "Fill form manually"** on ImportScreen → fill some fields → "Generate
   Summary" — the form converts to synthetic notes and produces a summary.

---

## 8. Files to Know

| Concern                 | File                                                          |
| ----------------------- | ------------------------------------------------------------- |
| Summary UI              | `apps/desktop/src/screens/SummaryScreen.tsx`                  |
| Import / routing        | `apps/desktop/src/screens/ImportScreen.tsx`, `App.tsx`        |
| Form editor (opt-in)    | `apps/desktop/src/screens/ReviewScreen.tsx`                   |
| Prompt editor           | `apps/desktop/src/screens/SettingsScreen.tsx`                 |
| Patient sidebar         | `apps/desktop/src/components/PatientSidebar.tsx`              |
| Summarizer logic        | `services/local-ai/src/summarizer.ts`                         |
| Prompt store / defaults | `services/local-ai/src/promptStore.ts`, `defaults/prompts.ts` |
| RAG / embeddings        | `services/local-ai/src/rag.ts`, `ragStore.ts`                 |
| Patient / session DB    | `services/local-ai/src/patientStore.ts`                       |
| DB schema / migrations  | `services/local-ai/src/db/migrations/001_initial.sql`         |
| API routes              | `services/local-ai/src/index.ts`                              |
| Form-fill pipeline      | `services/local-ai/src/narrativeQA.ts`                        |
| Config                  | `services/local-ai/src/config/index.ts`                       |
| ESLint                  | `.eslintrc.cjs`                                               |

---

## 9. Environment Variables (Quick Reference)

Create `.env` in `services/local-ai/`:

```bash
PORT=3001
LOG_LEVEL=info

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b-q4_K_M
EMBED_MODEL=nomic-embed-text
DISABLE_LLM=false

# OCR / files
OCR_CONFIDENCE_THRESHOLD=50
MAX_FILE_SIZE=52428800
TESSERACT_LANG_PATH=         # optional custom lang path

# DB
DB_PATH=./data/ara.db

# Performance
OLLAMA_GPU_ENABLED=true
OLLAMA_NUM_GPU_LAYERS=-1
OLLAMA_POOL_ENABLED=true
DISABLE_WARMUP=false
WARMUP_KEEP_ALIVE=300000

# Progress
PROGRESS_TTL=300000
PROGRESS_CLEANUP_INTERVAL=60000
```

---

## 10. Build & Test Status

| Check                                   | Status                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run build` (all workspaces)        | ✅ Pass                                                                                                    |
| `npm run typecheck` (all workspaces)    | ✅ Pass                                                                                                    |
| `npm run lint -- --quiet` (errors only) | ✅ 0 errors                                                                                                |
| `npm run lint` (full)                   | ⚠️ 542 warnings (non-blocking)                                                                             |
| `@ara/shared` tests                     | ✅ 11/11 pass                                                                                              |
| `@ara/local-ai` tests                   | ⚠️ Timeout on Ollama integration tests (expected if Ollama not running; deterministic fallback tests pass) |
| `@ara/desktop` tests                    | N/A (no test script defined)                                                                               |

**Fixes applied after initial summary:**

- React error boundary (`components/ErrorBoundary.tsx`) wraps the entire app.
- Keyboard shortcuts deduplicated (`utils/keyboard.ts` stripped of duplicate
  hook).
- SettingsScreen confirms before discarding unsaved prompt edits.
- `sanitizeRequest` middleware is now mounted in the Express pipeline.
- `chat_turns` endpoints added: `GET /patients/:id/chat-turns`,
  `POST /chat-turns`, `DELETE /chat-turns/:id`.

---

_Document written for the 2026-04-22 refactor review meeting. For granular
decisions and meeting notes, see the other files in this folder._
