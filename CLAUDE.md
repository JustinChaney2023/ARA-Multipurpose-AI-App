# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ARA Caregiver Assistant is a **local-first desktop app** (Tauri + React) that converts caregiver notes into structured "Monthly Care Coordination Monitoring Contact" forms for Alzheimer's Resource Alaska. It uses local OCR (tesseract.js) and optional local LLM (Ollama) — no PHI ever leaves the device.

## Commands

```bash
# Install dependencies
npm install

# Development (run together in separate terminals)
npm run dev:service     # Start AI service at localhost:3001
npm run dev:web         # Start web UI at localhost:1420 (no Tauri required)
npm run dev:desktop     # Start full Tauri desktop app

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

| Package | Path | Role |
|---------|------|------|
| `@ara/desktop` | `apps/desktop/` | Tauri + React 18 UI |
| `@ara/local-ai` | `services/local-ai/` | Express REST API (port 3001) |
| `@ara/shared` | `packages/shared/` | Zod schemas + shared utilities |

### Data Flow

```
User drops PDF/image
  → ImportScreen (React)
  → POST /extract/pdf  (multipart upload)
  → OCR: tesseract.js extracts raw text
  → Parser: regex + heuristics map text to form fields
  → (Optional) Ollama LLM refines low-confidence fields
  → ReviewScreen: user edits fields, color-coded by confidence
  → POST /export/pdf   → pdf-lib fills PDF template
```

### Key architectural decisions

- **HIPAA compliance**: Raw OCR text and PHI fields are never logged. `recipientName`, `recipientIdentifier`, `dob`, and signature fields are always left for manual entry.
- **LLM is optional**: The service degrades gracefully when `DISABLE_LLM=true` or Ollama is unavailable. Check `GET /health` for Ollama status.
- **Schema versioning**: The form has two schema versions. Active schema is `mccmc_v2` in `packages/shared/src/schema/mccmc_v2.ts`. Templates live in `templates/mccmc_v2/` with a `mapping.json` that maps form fields to PDF coordinates.
- **Progress tracking**: Long operations (OCR, LLM inference) emit progress via `progressStore.ts`; the frontend polls `GET /progress/:operation`.
- **Two Ollama clients**: `ollama.ts` is the original client; `ollamaClient.ts` is the optimized version with connection pooling and response caching. New code should use `ollamaClient.ts`.

### Service layer (`services/local-ai/src/`)

- `index.ts` — Express server, all route definitions, middleware wiring
- `config/index.ts` — Centralized config with Zod validation; all env vars read here
- `narrativeQA.ts` — Largest file; handles LLM-based Q&A for extracting narrative fields
- `parser.ts` — Regex/heuristic form parsing (runs before LLM)
- `formQuestions.ts` — Defines the Q&A prompts used by narrativeQA
- `middleware/` — security, rateLimit, requestLogger, errorHandler, validation, gracefulShutdown

### Frontend (`apps/desktop/src/`)

- Two screens: `ImportScreen.tsx` (upload) → `ReviewScreen.tsx` (edit/export)
- `ReviewScreen` is the main complex component (~24 KB); handles field editing, confidence highlighting, export options
- Path alias `@/*` maps to `src/*`

## Code Style

- **Prettier**: `singleQuote: true`, `semi: true`, `printWidth: 100`, `trailingComma: 'es5'`, `endOfLine: 'lf'`
- **TypeScript**: strict mode; use `NodeNext` module resolution in backend, `ESNext` in frontend
- **Imports**: Use `@ara/shared` for any type shared between frontend and service; never duplicate type definitions
- Pre-commit hooks (Husky + lint-staged) run ESLint + Prettier automatically

## Environment

Copy `.env.example` to `.env` in the root and `services/local-ai/.env.example` to `services/local-ai/.env`. Key variables:

```
PORT=3001
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
DISABLE_LLM=false           # Set true to skip LLM entirely
OLLAMA_CACHE_ENABLED=true   # Cache repeated LLM responses
OLLAMA_POOL_ENABLED=true    # HTTP connection pooling
```

## Testing notes

- Vitest is used in both `services/local-ai` and `packages/shared`
- LLM integration tests have a 5-minute timeout; set `DISABLE_LLM=true` to skip them in fast iteration
- Coverage thresholds: 50% lines/functions, 40% branches (services/local-ai)
