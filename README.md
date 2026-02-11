# ARA Caregiver Assistant

Alzheimer's Resource Alaska Caregiver Assistant - A local-first desktop app for converting caregiver notes into structured forms.

## Features

- **Import**: Drag-and-drop PDFs or images of caregiver notes
- **OCR**: Extract text using local OCR (tesseract.js)
- **Review**: Edit extracted form fields with confidence highlighting
- **Export**: Generate fillable PDFs
- **HIPAA-Compliant**: All processing happens locally by default
- **AI-Powered**: Optional Ollama LLM for better extraction accuracy (currently not functional as it timesout)

## Quick Start

```powershell
# Install dependencies
npm install

# Build shared package
npm run -w packages/shared build

# Terminal 1: Start Local AI Service
npm run dev:service

# Terminal 2: Start Desktop App
npm run dev:web
```

Open: http://localhost:1420

See [QUICKSTART.md](QUICKSTART.md) for more details.

## Project Structure

```
├── apps/desktop/       # Tauri + React desktop UI
├── services/local-ai/  # OCR + parsing service (Node.js/Express)
├── packages/shared/    # Shared TypeScript types
├── templates/          # PDF templates + field mappings
└── docs/               # Documentation
```

## Tech Stack

- **Desktop**: Tauri + React + TypeScript
- **Local AI**: Node.js + Express + tesseract.js
- **LLM (optional)**: Ollama with Qwen 3B/4B

## Development

```powershell
# Verify everything works
npm run verify

# Setup Ollama for AI enhancement
npm run setup:ollama
```

See [docs/development.md](docs/development.md) for detailed guide.

## License

MIT
