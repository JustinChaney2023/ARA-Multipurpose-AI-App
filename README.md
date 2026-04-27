# ARA Caregiver Assistant

ARA Caregiver Assistant is a local-first desktop application for turning
unstructured caregiver notes into clean care summaries, with an optional path
for filling Monthly Care Coordination Monitoring Contact forms.

The app is designed for Alzheimer's Resource Alaska care coordinators. It keeps
protected health information on the local machine by default and uses local OCR
and optional local LLM tooling for note processing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## Features

- Import typed notes, PDFs, and images
- Extract text locally with tesseract.js and PDF parsing tools
- Generate clean AI-assisted summaries from unstructured notes
- Edit summarizer prompts from the Settings screen
- Review source text alongside generated summaries
- Use the optional manual form path for MCCMC PDF export
- Keep processing local by default, with no required cloud services

## Quick Start

### Automated Setup

```bash
git clone <your-repo-url>
cd ara-caregiver-assistant
npm install
npm run setup
```

### Manual Setup

```bash
npm install
npm run -w packages/shared build
```

Start the local AI service in one terminal:

```bash
npm run dev:service
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open http://localhost:1420 in your browser.

For full desktop mode, install Rust and run:

```bash
npm run dev:desktop
```

## Requirements

| Tool    | Version         | Required For                       |
| ------- | --------------- | ---------------------------------- |
| Node.js | 18.0.0 or newer | All development                    |
| npm     | 9.0.0 or newer  | Workspace scripts                  |
| Rust    | 1.70.0 or newer | Tauri desktop builds               |
| Ollama  | Optional        | Local LLM summaries and extraction |

## Project Structure

```text
ara-caregiver-assistant/
|-- apps/
|   `-- desktop/          # Tauri + React desktop application
|-- services/
|   `-- local-ai/         # OCR, summaries, prompts, and PDF export API
|-- packages/
|   `-- shared/           # Shared TypeScript types and schemas
|-- templates/            # PDF templates and field mappings
|-- scripts/              # Setup, verification, and cleanup scripts
|-- docker-compose.yml    # Docker orchestration
`-- Dockerfile            # Container build
```

## Tech Stack

| Component        | Technology                                   |
| ---------------- | -------------------------------------------- |
| Desktop UI       | Tauri v1.5, React 18, TypeScript 5.3, Vite 5 |
| Local AI Service | Node.js, Express, TypeScript                 |
| OCR              | tesseract.js, pdf-parse, pdf2pic             |
| PDF Generation   | pdf-lib                                      |
| Database         | SQLite via better-sqlite3                    |
| Optional LLM     | Ollama with Qwen3 4B                         |
| Validation       | Zod                                          |
| Tests            | Vitest                                       |

## Development Commands

```bash
# Setup
npm run setup
npm run setup:win
npm run setup:mac
npm run setup:linux

# Development
npm run dev:service        # Start local AI service on port 3001
npm run dev:web            # Start web app on port 1420
npm run dev:desktop        # Start Tauri desktop app

# Build and verification
npm run build              # Build shared, desktop, and local-ai packages
npm run typecheck          # Type-check all workspaces
npm run test               # Run workspace tests
npm run lint               # Run ESLint
npm run format:check       # Check Prettier formatting
npm run format             # Format files
npm run ci                 # Run lint, typecheck, and tests

# Docker
docker-compose up -d
docker-compose logs -f local-ai
docker-compose down
```

### Make Commands

On macOS and Linux:

```bash
make setup
make dev-service
make dev-web
make test
make docker-up
```

## Local AI Service

The service runs at http://localhost:3001 and handles OCR, summary generation,
prompt storage, progress updates, validation, and PDF export.

Useful endpoints include:

| Method | Endpoint          | Purpose                         |
| ------ | ----------------- | ------------------------------- |
| GET    | `/health`         | Service and Ollama health check |
| POST   | `/summarize`      | Summarize raw note text         |
| POST   | `/summarize/file` | OCR a file and summarize it     |
| POST   | `/extract/fill`   | Optional form extraction path   |
| POST   | `/export/pdf`     | Generate a fillable PDF         |
| GET    | `/prompts`        | List editable prompts           |
| PUT    | `/prompts/:name`  | Update an editable prompt       |

## Environment

Create `services/local-ai/.env` when local overrides are needed:

```bash
PORT=3001
LOG_LEVEL=info
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b-q4_K_M
DB_PATH=data/ara.db
```

Set `DISABLE_LLM=true` to run without Ollama.

## Docker Deployment

```bash
docker-compose up -d
docker-compose logs -f local-ai
docker-compose down
```

## Privacy and Local Processing

- Core processing runs locally by default.
- Raw OCR text and form data should not be logged.
- Temporary upload files are cleaned up after processing.
- Ollama integration is optional and can run locally.
- Cloud services are not required for the core workflow.

## Documentation

| Document                       | Description                         |
| ------------------------------ | ----------------------------------- |
| [SETUP.md](SETUP.md)           | Full setup guide                    |
| [QUICKSTART.md](QUICKSTART.md) | Short command reference             |
| [.env.example](.env.example)   | Example local service configuration |

## License

MIT License. See [LICENSE](LICENSE).
