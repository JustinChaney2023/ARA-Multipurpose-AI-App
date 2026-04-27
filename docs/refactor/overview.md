# Refactor Overview

Started: 2026-04-22. Status: **Phases 1 & 2 shipped; Phase 3 foundation in
place, CRUD + UI still to do.**

## Why

The current pipeline is OCR → parser → LLM Q&A → rigid multi-section form.
Meeting direction (see
[2026-04-22-meeting-notes.md](2026-04-22-meeting-notes.md)) is to pivot away
from strict per-field extraction toward a looser "text in, summary out" model,
then grow into a highly-customizable, patient-aware assistant with long-term
memory over prior visits.

## Intended end state

- **Input**: one large text area (primary) + file upload (OCR path) + optional
  audio (transcribed). All three land as plain text.
- **Output**: a clean, neatly organized summary. This is **the deliverable** —
  the fillable-PDF workflow is no longer the primary output.
- **Optional form-fill mode**: a button on the input screen opens the structured
  MCCMC form view so a user can fill it inside the app instead of pasting
  pre-formatted text. This is an alternate path, not the default.
- **Persistent storage**: local SQLite (via Tauri SQL plugin) holding patients,
  folders, raw inputs, summaries, and chat history. Raw text retained even when
  excluded from summary (captures "sidetrack" info).
- **Custom prompts**: user-editable from the UI. Prompts are first-class data.
- **RAG over prior visits**: when summarizing/chatting about a patient, the LLM
  can pull context from that patient's earlier notes.
- **Off-topic handling**: non-health talk is excluded from the summary but kept
  in raw text so nothing is lost.

## Decisions (locked — 2026-04-22)

| #   | Decision                                                                 | Note                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Section form becomes **optional**, not primary.                          | Button on the input screen opens the structured form; summary path stays the default.                                                                                                                                                                                                                |
| 2   | Deliverable is **a neat, organized summary**.                            | Drop the fillable PDF as the headline output. Form-PDF export stays available when a user takes the form path.                                                                                                                                                                                       |
| 3   | Persistence = **SQLite, owned by the `services/local-ai` Node service**. | SQLite over file-based JSON for folder hierarchy, longitudinal queries, and RAG vector lookups. Service-owned (not Tauri-plugin-owned) so the LLM and vector store are co-located for RAG. See [phase-3-persistence.md](phase-3-persistence.md). Trade-off accepted: service is no longer stateless. |

## Scope

**In:**

- Input/Review screen restructure (summary-primary, form as opt-in)
- Summarizer prompt tightening (exclude non-health talk; retain sidetracks in
  raw)
- Editable prompt UI
- SQLite persistence: patients, folders, raw inputs, summaries, chat turns,
  embeddings
- Patient folder organization in the UI
- RAG over per-patient prior notes
- Audio input → transcript pipeline (new)
- Handwriting OCR improvements (builds on the approved Moondream plan)

**Out (for now):**

- Billing system integration (workflow ends at "typing" for this app)
- Multi-user auth / permissions
- Cloud sync / multi-device

## Architectural implications

- **`narrativeQA.ts` pipeline stays alive** — it powers the optional form-fill
  button. Don't delete it. But it's no longer on the critical path.
- **`/summarize` is promoted to the primary output endpoint.** Prompt moves out
  of code into a stored/editable location.
- **PDF export becomes a secondary feature**, only triggered when the form path
  is used.
- **New persistence layer** replaces (or wraps) the current localStorage-only
  `utils/history.ts`.
- **Code style shifts**: going forward, code in refactor work should be cleanly
  written with comments that aid understanding (see feedback memory). Not
  over-commented — but not bare either.

## Phases

1. **Phase 1 — Summary-primary review surface** _(shipped)_. Single
   textarea/file → summary as default output. "Fill form manually" button opens
   the existing Review form. See
   [phase-1-input-to-summary.md](phase-1-input-to-summary.md).
2. **Phase 2 — Editable prompt UI** _(shipped)_. Summarizer prompts live in the
   SQLite `prompts` table, seeded from `defaults/prompts.ts` on startup.
   Settings screen wired into the header. See
   [phase-2-custom-prompts.md](phase-2-custom-prompts.md).
3. **Phase 3 — SQLite persistence + patient folders** _(foundation laid —
   migrations runner + full schema; CRUD/UI pending)_. Schema ships with Phase
   2's migration. See [phase-3-persistence.md](phase-3-persistence.md).
4. **Phase 4 — RAG over prior notes**. Embedding pipeline, similarity search,
   context injection. See [phase-4-rag.md](phase-4-rag.md).
5. **Phase 5 — Audio input**. Local Whisper (or equivalent) → transcript →
   summary.
6. **Phase 6 — Handwriting OCR improvements**. Continues the approved Moondream
   plan.

Phases 5 and 6 are independent modalities and can run in parallel once Phase 3
is done (they need somewhere to store results).

## Resolved questions

- ~~Section form: keep or remove?~~ → **Optional via button; not primary.**
- ~~PDF deliverable?~~ → **Replaced by summary; PDF export stays as form-path
  feature.**
- ~~Database location?~~ → **Local SQLite via Tauri SQL plugin.**

## Still-open questions

- Audio: local-only (Whisper) or allow cloud fallback like the remote-Ollama
  pattern? (Phase 5 detail.)
- Patient folder UX: flat list with a "folder" field, or nested folders? (Phase
  3 detail.)

## Resolved during implementation (2026-04-22)

- **Summary format** → Flowing prose paragraphs, no headings/bullets. The prompt
  instructs the LLM to weave 10 care-coordination topics into narrative prose.
  See `defaults/prompts.ts`.
- **Prompt storage** → SQLite `prompts` table, seeded from code defaults.
  Auto-syncs uncustomized prompts to new code defaults on startup.
- **Embedding model** → `nomic-embed-text` via Ollama, configurable via
  `EMBED_MODEL` env var. In-memory cosine similarity (patient-scoped) for
  retrieval.
