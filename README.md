# ARA Caregiver Assistant

Alzheimer's Resource Alaska Caregiver Assistant - A **local-first desktop
application** that converts unstructured caregiver notes into structured
"Monthly Care Coordination Monitoring Contact" forms.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## Features

- **📄 Import**: Drag-and-drop PDFs or images of caregiver notes
- **🔍 OCR**: Extract text using local OCR (tesseract.js) - no cloud services
- **🤖 AI Enhancement**: Optional Ollama LLM integration for better extraction
  accuracy
- **✏️ Review**: Edit extracted form fields with confidence highlighting
- **📤 Export**: Generate fillable PDFs with extracted data
- **🔒 HIPAA-Compliant**: All processing happens locally by default; no PHI
  leaves the device

## Quick Start

### Automated Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd ara-caregiver-assistant

# Run the automated setup (detects your platform)
npm run setup
```

### Manual Setup

<details>
<summary>Windows</summary>

```powershell
# Install dependencies
npm install

# Build shared package
npm run -w packages/shared build

# Terminal 1: Start AI Service
npm run dev:service

# Terminal 2: Start Web App
npm run dev:web
```

</details>

<details>
<summary>macOS/Linux</summary>

```bash
# Install dependencies
npm install

# Build shared package
npm run -w packages/shared build

# Terminal 1: Start AI Service
npm run dev:service

# Terminal 2: Start Web App
npm run dev:web
```

</details>

Open http://localhost:1420 in your browser.

## Documentation

| Document                                                         | Description                            |
| ---------------------------------------------------------------- | -------------------------------------- |
| [SETUP.md](SETUP.md)                                             | Complete setup guide for all platforms |
| [QUICKSTART.md](QUICKSTART.md)                                   | Quick reference for common tasks       |
| [docs/development.md](docs/development.md)                       | Detailed development guide             |
| [docs/ollama-setup.md](docs/ollama-setup.md)                     | Ollama installation and setup          |
| [docs/ollama-troubleshooting.md](docs/ollama-troubleshooting.md) | Common Ollama issues                   |

## Project Structure

```
ara-caregiver-assistant/
├── apps/
│   └── desktop/          # Tauri + React desktop application
├── services/
│   └── local-ai/         # OCR + LLM processing service (Node.js/Express)
├── packages/
│   └── shared/           # Shared TypeScript types and schemas
├── templates/            # PDF templates + field mappings
├── scripts/              # Setup and utility scripts
├── docs/                 # Documentation
├── docker-compose.yml    # Docker orchestration
└── Dockerfile            # Container build
```

## Tech Stack

| Component             | Technology                             |
| --------------------- | -------------------------------------- |
| **Desktop UI**        | Tauri v1.5 + React 18 + TypeScript 5.3 |
| **Local AI Service**  | Node.js 18+ + Express + TypeScript     |
| **OCR Engine**        | tesseract.js (local, offline)          |
| **PDF Processing**    | pdf-parse, pdf2pic, pdf-lib            |
| **Optional LLM**      | Ollama with Qwen3 4B                   |
| **Schema Validation** | Zod                                    |
| **Testing**           | Vitest                                 |

## Platform Support

| Platform | Web Mode | Desktop App | Docker |
| -------- | -------- | ----------- | ------ |
| Windows  | ✅       | ✅          | ✅     |
| macOS    | ✅       | ✅          | ✅     |
| Linux    | ✅       | ✅          | ✅     |

## Development Commands

```bash
# Setup
npm run setup              # Automated setup for your platform
npm run setup:win          # Windows setup
npm run setup:mac          # macOS setup
npm run setup:linux        # Linux setup

# Development
npm run dev:service        # Start AI service (localhost:3001)
npm run dev:web            # Start web app (localhost:1420)
npm run dev:desktop        # Start desktop app (requires Rust)

# Build
npm run build              # Build all packages
npm run build:desktop      # Build desktop app for production

# Testing & Quality
npm run test               # Run all tests
npm run verify             # Run verification (typecheck + tests)
npm run lint               # Run linter
npm run lint:fix           # Fix linting issues
npm run format             # Format code

# Docker
docker-compose up -d       # Start services with Docker
docker-compose logs -f     # View Docker logs
docker-compose down        # Stop Docker services

# Ollama (optional AI enhancement)
npm run setup:ollama       # Setup Ollama with recommended model
```

### Using Make (Linux/macOS)

```bash
make setup          # Full setup
make dev-service    # Start AI service
make dev-web        # Start web app
make test           # Run tests
make docker-up      # Start with Docker
```

## Requirements

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Rust** >= 1.70.0 (optional, for desktop app)
- **Ollama** (optional, for AI enhancement)

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f local-ai

# Stop services
docker-compose down
```

## HIPAA Compliance

- ✅ All processing is **local by default** - no PHI leaves the device
- ✅ **No raw OCR text logged** to console or analytics
- ✅ **Temporary files** are cleaned up after processing
- ✅ **No cloud dependencies** required for core functionality

## License

MIT License - See [LICENSE](LICENSE) file
