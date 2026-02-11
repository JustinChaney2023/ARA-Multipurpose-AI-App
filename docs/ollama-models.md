# Ollama Models for Laptops

## Recommended Models (Fastest to Slowest)

### 1. phi3:mini ⭐ Best for Laptops
- **Size:** 2.0 GB
- **Speed:** Fastest (5-15 seconds)
- **Quality:** Good for form extraction
- **RAM needed:** 4GB free

```powershell
ollama pull phi3:mini
```

### 2. qwen2.5:1.8b
- **Size:** 1.1 GB  
- **Speed:** Very fast (5-10 seconds)
- **Quality:** Good for structured data
- **RAM needed:** 3GB free

```powershell
ollama pull qwen2.5:1.8b
```

### 3. qwen2.5:3b (Balance)
- **Size:** 1.9 GB
- **Speed:** Moderate (10-20 seconds)
- **Quality:** Better accuracy
- **RAM needed:** 4GB free

```powershell
ollama pull qwen2.5:3b
```

## Current: qwen:4b
- **Size:** 2.3 GB
- **Speed:** Slow on laptops (30-60+ seconds)
- **Quality:** Best accuracy
- **RAM needed:** 6GB+ free

## Switch Models

```powershell
# Pull a faster model
ollama pull phi3:mini

# Set as default for the app
$env:OLLAMA_MODEL="phi3:mini"
npm run dev:service
```

Or create `.env` file in `services/local-ai/`:
```
OLLAMA_MODEL=phi3:mini
```

## Test Model Speed

PowerShell command:
```powershell
$body = '{"model":"phi3:mini","prompt":"Extract name: John Doe, Date: 01/15/2024","stream":false}'
$time = Measure-Command { Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -ContentType "application/json" -Body $body }
Write-Host "Response time: $($time.TotalSeconds) seconds"
```

## If Still Timing Out

The app works perfectly in **OCR-only mode** without Ollama! The LLM just gives slightly better accuracy.

To disable Ollama and stop the timeouts:
1. Stop Ollama: `Get-Process ollama | Stop-Process`
2. The app will automatically use OCR-only mode
