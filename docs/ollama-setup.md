# Ollama Setup Guide

Ollama provides local LLM capabilities for intelligent form extraction. Without it, the app works in **OCR-only mode**.

## What Ollama Does

- Processes OCR text to extract structured form data
- Improves accuracy over simple pattern matching
- Runs entirely locally (no data leaves your device)
- Falls back automatically if unavailable

## Installation

### Windows

```powershell
# Download from https://ollama.com/download/windows
# Or use winget:
winget install Ollama.Ollama
```

### macOS

```bash
# Download from https://ollama.com/download/mac
# Or use Homebrew:
brew install ollama
```

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## Download the Model

After installing Ollama, download the Qwen 4B model (optimized for this app):

```bash
ollama pull qwen:4b
```

This downloads ~2.3GB. Other models that work well:
- `qwen2.5:3b` - Smaller, faster
- `phi3:mini` - Microsoft's model
- `llama3.2:3b` - Meta's model

## Verify Installation

```bash
# Check Ollama is running
ollama --version

# List available models
ollama list

# Test the API
curl http://localhost:11434/api/tags
```

You should see:
```json
{"models":[{"name":"qwen:4b","model":"qwen:4b",...}]}
```

## Configure the App

The app auto-detects Ollama. To use a different model, set an environment variable:

```bash
# Windows PowerShell
$env:OLLAMA_MODEL="qwen2.5:3b"
npm run dev:service

# Or create a .env file in services/local-ai/
OLLAMA_MODEL=qwen2.5:3b
```

## System Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: ~3GB for model
- **CPU**: Any modern CPU (GPU acceleration optional)

## Troubleshooting

### Ollama not detected
```bash
# Check if running
Get-Process ollama  # Windows
ps aux | grep ollama  # macOS/Linux

# Start manually
ollama serve
```

### Model download fails
```bash
# Try alternative model
ollama pull qwen2.5:3b

# Or use phi3 which is smaller
ollama pull phi3:mini
```

### Out of memory
```bash
# Use a smaller model
ollama pull qwen2.5:1.8b
```

## Disable Ollama (OCR-only mode)

Simply don't install/start Ollama. The app automatically falls back to pattern matching.
