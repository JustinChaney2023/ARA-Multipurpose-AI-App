# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## ⚠️ Active refactor (started 2026-04-22)

The app is being pivoted **away from rigid per-field form extraction** toward a
**single-textarea input → AI summary** model, growing into a patient-aware
assistant with local SQLite persistence, editable prompts, and per-patient RAG.

**Locked decisions:**

- Deliverable is a neat, organized summary (not the fillable PDF).
- The multi-section form stays alive as an **opt-in** path behind a "Fill form
  manually" button.
- Persistence will be **local SQLite** via `@tauri-apps/plugin-sql`.

Before editing the Review screen, narrative Q&A pipeline, summarizer, form
schema, or history storage, read:

- [docs/refactor/README.md](docs/refactor/README.md) — index
- [docs/refactor/overview.md](docs/refactor/overview.md) — goals, phase map,
  still-open questions
- [docs/refactor/phase-1-input-to-summary.md](docs/refactor/phase-1-input-to-summary.md)
  — active phase

Do not delete `narrativeQA.ts` / `questionAnswerer.ts` / `formQuestions.ts` /
the MCCMC form schema — they power the opt-in form path.

**Code-style note for refactor work:** write code cleanly and comment for
understanding (not over-commented, but not bare). Overrides the default "no
comments" rule.

## Project Overview

ARA Caregiver Assistant is a **local-first desktop app** (Tauri + React) that
converts caregiver notes into structured "Monthly Care Coordination Monitoring
Contact" forms for Alzheimer's Resource Alaska. It uses local OCR (tesseract.js)
and optional local LLM (Ollama) — no PHI ever leaves the device.

## Commands

```bash
# Install dependencies
npm install

# Development (run together in separate terminals)
npm run dev:service     # Start AI service at localhost:3001
npm run dev:web         # Start web UI at localhost:1420 (no Tauri required)
npm run dev:desktop     # Start full Tauri desktop app

# First-time setup
npm run setup           # Cross-platform setup script
npm run setup:win       # Windows-specific (PowerShell)
npm run setup:ollama    # Pull recommended Ollama model
npm run verify          # Verify environment is ready

# Build
npm run build           # Build all workspaces
npm run build:desktop   # Build Tauri desktop app for production

# Quality checks
npm run lint            # ESLint
npm run lint:fix        # ESLint with auto-fix
npm run typecheck       # TypeScript type checking
npm run format          # Prettier
npm run ci              # Full CI pipeline (lint + typecheck + test)

# Testing
npm run test            # All tests across workspaces
npm run test:coverage   # With coverage report

# Run a single test file
cd services/local-ai && npx vitest run src/__tests__/<file>.test.ts

# Docker
npm run docker:up       # Start all services
npm run docker:down     # Stop all services
```

## Architecture

This is an **npm workspaces monorepo** with three packages:

| Package         | Path                 | Role                                                       |
| --------------- | -------------------- | ---------------------------------------------------------- |
| `@ara/desktop`  | `apps/desktop/`      | Tauri + React 18 UI                                        |
| `@ara/local-ai` | `services/local-ai/` | Express REST API (port 3001)                               |
| `@ara/shared`   | `packages/shared/`   | Zod schemas, form utilities, validation, date/time helpers |

### Data Flow

```
User drops PDF/image
  → ImportScreen (React)
  → POST /extract/pdf  (multipart upload)
  → OCR: tesseract.js extracts raw text
  → fillNarrativeWithQA: parser (regex) + LLM Q&A fill form fields
  → ReviewScreen: user edits fields, color-coded by confidence
  → (Optional) POST /summarize → AI-generated summary of notes
  → POST /export/pdf  → pdfGenerator.ts builds professional PDF
  → POST /export/preview → base64 PDF preview in-app
```

### API Endpoints (`services/local-ai`)

| Method | Path                         | Purpose                                          |
| ------ | ---------------------------- | ------------------------------------------------ |
| GET    | `/health`                    | Health check with Ollama/model/GPU status        |
| POST   | `/extract/pdf`               | Upload file → OCR → AI form fill (main pipeline) |
| POST   | `/extract/fill`              | Fill form from raw text (skips OCR)              |
| POST   | `/summarize`                 | Generate AI summary of caregiver notes           |
| POST   | `/export/pdf`                | Generate filled PDF download                     |
| POST   | `/export/preview`            | Generate PDF as base64 for in-app preview        |
| POST   | `/validate`                  | Validate form data                               |
| POST   | `/format`                    | Auto-format dates/times                          |
| POST   | `/defaults`                  | Apply smart defaults to empty form fields        |
| GET    | `/progress/:operation`       | Poll long-running operation progress             |
| GET    | `/template/:version/mapping` | Get PDF template field mapping (v1 or v2)        |
| GET    | `/admin/performance`         | GPU, threading, pool config status               |

### Key architectural decisions

- **HIPAA compliance**: Raw OCR text and PHI fields are never logged.
  `recipientName`, `recipientIdentifier`, `dob`, and signature fields are always
  left for manual entry.
- **LLM is optional**: The service degrades gracefully when `DISABLE_LLM=true`
  or Ollama is unavailable. Check `GET /health` for Ollama status.
- **Schema versioning**: Two template versions exist (`mccmc_v1` and
  `mccmc_v2`). Active schema is `mccmc_v2` in
  `packages/shared/src/schema/mccmc_v2.ts`. Templates live in
  `templates/<version>/` with a `mapping.json` mapping form fields to PDF
  coordinates.
- **Progress tracking**: Long operations (OCR, LLM inference) emit progress via
  `progressStore.ts`; the frontend polls `GET /progress/:operation`.
- **Model warmup**: On startup, the service warms up Ollama and runs a
  keep-alive ping loop (`warmup.ts`). Configurable via `DISABLE_WARMUP` and
  `WARMUP_KEEP_ALIVE` env vars.
- **Ollama client**: `ollamaClient.ts` is the primary client with connection
  pooling, retries, and GPU optimization. `ollama.ts` is a legacy wrapper that
  delegates to it. **New code should import from `ollamaClient.ts`.**

### Service layer (`services/local-ai/src/`)

- `index.ts` — Express server, all route definitions, middleware wiring
- `config/index.ts` — Centralized config with Zod validation; all env vars read
  here
- `narrativeQA.ts` — Largest file (~39K); orchestrates LLM-based Q&A for
  extracting narrative fields
- `questionAnswerer.ts` — Q&A module used by narrativeQA for form filling
- `llmCategorizer.ts`, `parser.ts` — **Not wired into any route** (kept only so
  existing unit tests pass). When extending the extraction pipeline, edit
  `narrativeQA.ts` / `questionAnswerer.ts` — do not route new work through these
  files.
- `formQuestions.ts` — Defines the Q&A prompts used by narrativeQA
- `summarizer.ts` — LLM-based summary generation for caregiver notes
- `pdfGenerator.ts` — Professional PDF generation (used by `/export/pdf` and
  `/export/preview`)
- `pdfExport.ts` — PDF export utilities
- `ollamaClient.ts` — Optimized Ollama client (pooling, retries, GPU)
- `modelConfig.ts` — Model configuration and availability checking
- `warmup.ts` — Model warmup and keep-alive
- `ocr.ts` — tesseract.js OCR integration
- `progressStore.ts` — In-memory progress tracking for long operations
- `logger.ts` — Structured logging (PHI-safe)
- `jsonUtils.ts` — JSON parsing utilities for LLM responses
- `validation.ts` — Form validation, date/time formatting, smart defaults
- `middleware/` — security, rateLimit (with circuit breaker), requestLogger,
  errorHandler, validation, gracefulShutdown

### Frontend (`apps/desktop/src/`)

**Screens:**

- `ImportScreen.tsx` — File upload with drag-and-drop
- `ReviewScreen.tsx` — Main form editor (~24K); field editing, confidence
  highlighting, export

**Key components (`components/`):**

- `HistoryPanel.tsx` / `QuickHistory.tsx` — Browse and restore past extractions
- `ExportOptions.tsx` — Export format and settings
- `TemplatePicker.tsx` — Select template version (v1/v2)
- `PDFPreview.tsx` — In-app PDF preview
- `JsonImport.tsx` — Import form data from JSON
- `ThemeToggle.tsx` — Dark/light mode
- `ShortcutsHelp.tsx` — Keyboard shortcuts reference
- `ProgressBar.tsx`, `Tooltip.tsx`, `CopyButton.tsx`, `WordCount.tsx`

**Custom hooks (`hooks/`):**

- `useAutoSave.ts` — Auto-save form state
- `useUndoRedo.ts` — Undo/redo for form edits
- `useKeyboardShortcuts.ts` — Global keyboard shortcut handling
- `useSmoothProgress.ts` — Smooth progress bar animation

**Utilities (`utils/`):** history, autoSave, clipboard, keyboard, quickHistory,
templates, theme, validation, formValidation

Path alias `@/*` maps to `src/*`.

## Code Style

- **Prettier**: `singleQuote: true`, `semi: true`, `printWidth: 100`,
  `trailingComma: 'es5'`, `endOfLine: 'lf'`
- **TypeScript**: strict mode; `NodeNext` module resolution in backend,
  `bundler` in frontend
- **Imports**: Use `@ara/shared` for any type shared between frontend and
  service; never duplicate type definitions
- Pre-commit hooks (Husky + lint-staged) run ESLint + Prettier automatically

## Environment

Copy `.env.example` to `.env` in the root and `services/local-ai/.env.example`
to `services/local-ai/.env`. Key variables:

```
PORT=3001
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b-q4_K_M   # Recommended; see .env.example for alternatives
DISABLE_LLM=false               # Set true to skip LLM entirely
OLLAMA_POOL_ENABLED=true        # HTTP connection pooling
```

The `services/local-ai/.env.example` has extensive documentation for GPU,
performance tuning, OCR, upload, and warmup settings.

## Testing notes

- Vitest is used in both `services/local-ai` and `packages/shared`
- LLM integration tests have a 5-minute timeout; set `DISABLE_LLM=true` to skip
  them in fast iteration
- Coverage thresholds: 50% lines/functions, 40% branches (services/local-ai)
- Test files: `services/local-ai/src/__tests__/integration.test.ts`,
  `narrativeQA.test.ts`; `packages/shared/src/__tests__/schema.test.ts`
