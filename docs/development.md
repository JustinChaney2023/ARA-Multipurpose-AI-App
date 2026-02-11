# Development Guide

## Prerequisites

- Node.js >= 18.0.0
- Rust (for Tauri)
- Ollama (optional, for LLM features)

## Setup

```bash
# Install dependencies
npm install

# Build shared package
npm run -w packages/shared build
```

## Running the App

Terminal 1 - Start the local AI service:
```bash
npm run dev:service
```

Terminal 2 - Start the desktop app:
```bash
npm run dev:desktop
```

## Project Structure

```
.
├── apps/
│   └── desktop/          # Tauri + React desktop app
├── services/
│   └── local-ai/         # OCR + LLM processing service
├── packages/
│   └── shared/           # Shared types and utilities
├── templates/            # PDF templates + mappings
└── docs/                 # Documentation
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run verify` | Run verification checks |
| `npm run dev:service` | Start local AI service |
| `npm run dev:desktop` | Start desktop app in dev mode |
| `npm run build:desktop` | Build desktop app for production |

## Environment Variables

Create a `.env` file in the root:

```bash
# Local AI service
PORT=3001

# Ollama (optional)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen:4b

# App
APP_ENV=development
```
