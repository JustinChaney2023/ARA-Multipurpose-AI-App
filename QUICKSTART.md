# Quick Start Guide

Get up and running with ARA Caregiver Assistant in minutes.

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- (Optional) Ollama for AI features ([Download](https://ollama.ai))

## First Time Setup

### Automated Setup (Recommended)

```bash
# Run the automated setup for your platform
npm run setup
```

This will check prerequisites, install dependencies, build packages, and
configure your environment.

### Manual Setup

If the automated setup doesn't work:

```bash
# Install dependencies
npm install

# Build shared package (required)
npm run -w packages/shared build

# Create environment file
cp services/local-ai/.env.example services/local-ai/.env
```

## Start the App

You need **two terminals** running:

**Terminal 1 - Local AI Service:**

```bash
npm run dev:service
```

**Terminal 2 - Desktop/Web App:**

```bash
npm run dev:web
```

Then open: http://localhost:1420

## Usage

1. **Import**: Drop a PDF or image of caregiver notes onto the import screen
2. **Review**: Edit extracted fields (yellow/red = low confidence)
3. **Export**: Download as fillable PDF or JSON

## Ollama (Optional AI Enhancement)

The app works great with OCR-only mode, but Ollama can improve extraction
accuracy.

### Install Ollama

**Windows:**

```powershell
winget install Ollama.Ollama
```

**macOS:**

```bash
brew install ollama
```

**Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Setup Model

```bash
# Pull recommended model (~2.3GB)
npm run setup:ollama
```

Or manually:

```bash
ollama pull qwen3:4b-q4_K_M
```

### Troubleshooting Ollama

If Ollama keeps timing out, the app **auto-disables LLM** after the first
timeout and uses OCR-only mode. No action needed!

**To completely disable Ollama:**

```bash
# In services/local-ai/.env
DISABLE_LLM=true
```

**Or stop Ollama:**

```powershell
# Windows
Get-Process ollama | Stop-Process

# macOS/Linux
pkill ollama
```

## Test Everything

```bash
# Run all checks
npm run verify

# Test API
curl http://localhost:3001/health
```

## Common Issues

### Port 3001 in use

**Windows:**

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess
Stop-Process -Id <PID>
```

**macOS/Linux:**

```bash
lsof -ti:3001 | xargs kill -9
```

### Clean Start

If things aren't working:

```bash
# Clean and reinstall
npm run clean
npm install
npm run -w packages/shared build
```

## Next Steps

- **Full Setup Guide**: See [SETUP.md](SETUP.md)
- **Development Guide**: See [docs/development.md](docs/development.md)
- **Ollama Models**: See [docs/ollama-models.md](docs/ollama-models.md) for
  faster models
- **Troubleshooting**: See
  [docs/ollama-troubleshooting.md](docs/ollama-troubleshooting.md)
