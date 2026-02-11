# Quick Start Guide

## Prerequisites Met
- Node.js 18+ installed
- Rust (Cargo 1.93.0) installed

## First Time Setup

```powershell
# Install dependencies
npm install

# Build shared package
npm run -w packages/shared build
```

## Start the App

**Terminal 1 - Local AI Service:**
```powershell
npm run dev:service
```

**Terminal 2 - Desktop App:**
```powershell
npm run dev:web
```

Then open: http://localhost:1420

## Ollama Issues? (Skip This)

If Ollama keeps timing out, the app now **auto-disables LLM** after first timeout and uses OCR-only mode for the rest of the session. No action needed!

**To completely disable Ollama:**
```powershell
# In Terminal 1, stop the service (Ctrl+C), then run:
$env:DISABLE_LLM="true"
npm run dev:service
```

Or just stop Ollama:
```powershell
Get-Process ollama | Stop-Process
```

## Test Everything

```powershell
# Run all checks
npm run verify

# Test API (in another terminal)
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

## Usage

1. **Import**: Drop a PDF or image of caregiver notes
2. **Review**: Edit extracted fields (yellow/red = low confidence)
3. **Export**: Download as PDF or JSON

**Note:** The first extraction may timeout with Ollama. After that, the app automatically uses OCR-only mode (which works great!).

## Troubleshooting

**Port 3001 in use:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess
Stop-Process -Id <PID>
```

**Full Documentation**
- `docs/ollama-models.md` - Faster models for laptops
- `docs/ollama-troubleshooting.md` - Detailed help
- `docs/development.md` - Development guide
