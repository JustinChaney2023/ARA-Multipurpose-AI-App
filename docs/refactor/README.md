# Refactor Notes

Rolling log for the major refactor kicked off 2026-04-22.

Every change, decision, meeting note, and open question during this refactor lives in this folder. Files are named by topic (or `YYYY-MM-DD-*` for dated logs) so they stay easy to browse.

## Status

- **Phase 1 shipped.** Input → summary is the default path. Structured form lives behind the "Fill form manually" button on the import screen.
- **Phase 2 shipped.** Prompts are editable from the new Settings screen (header button). Bodies persist in SQLite; `summarizer.main` + `summarizer.system` are the seeded defaults.
- **Phase 3 foundation landed** alongside Phase 2: `better-sqlite3` connection with WAL + FK pragmas, a migrations runner (`src/db/migrate.ts`), and the initial schema (`001_initial.sql`) that ships the prompts table plus the patient / folder / session / summary / chat / embeddings tables for the rest of Phase 3 and Phase 4. Session / patient CRUD endpoints aren't wired yet.
- Decisions locked 2026-04-22: summary is the deliverable, SQLite for persistence, form path stays alive behind a button. See [overview.md](overview.md).
- Mock interview still pending — expect it to sharpen Phase 2+ details.

## Index

| File | Purpose |
|------|---------|
| [overview.md](overview.md) | Refactor goals, locked decisions, phase map, open questions |
| [2026-04-22-refactor-summary.md](2026-04-22-refactor-summary.md) | **Meeting briefing:** full before/after, architecture, demo script, file map |
| [2026-04-22-meeting-notes.md](2026-04-22-meeting-notes.md) | Raw meeting notes (verbatim) + Justin's framing |
| [phase-1-input-to-summary.md](phase-1-input-to-summary.md) | Summary-primary review surface (+ opt-in form-fill button) |
| [phase-2-custom-prompts.md](phase-2-custom-prompts.md) | User-editable prompt storage + UI |
| [phase-3-persistence.md](phase-3-persistence.md) | SQLite via Tauri SQL plugin; patients, folders, sessions, summaries |
| [phase-4-rag.md](phase-4-rag.md) | Per-patient RAG over prior sessions, summaries, chat |

## How to log

- One doc per topic. Decisions go in `overview.md` once locked; in-progress ideas go in topic docs.
- Meeting notes are **verbatim + dated**. Interpretation goes in a separate commentary section.
- When a decision is made, update `overview.md` and mark the question resolved in the topic doc.
