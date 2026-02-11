# Ollama Troubleshooting

## Timeout on First Run

**Problem:** LLM parsing fails with timeout on first use.

**Cause:** Ollama needs to load the model into memory on first run, which can take 1-2 minutes.

**Solution:**
1. Wait for the first request to complete (it will timeout)
2. The second request will be fast
3. Or warm up the model manually:

```powershell
# Warm up the model (one time)
curl -X POST http://localhost:11434/api/generate -d "{\"model\":\"qwen:4b\",\"prompt\":\"Hello\",\"stream\":false}"
```

## Improving OCR Confidence

The OCR confidence of 31% in your test is low. Tips:

1. **Use higher resolution images** - at least 300 DPI
2. **Ensure good lighting** - avoid shadows and glare
3. **Use text-based PDFs when possible** - they extract at 95% confidence
4. **Clean handwritten notes** - clearer handwriting = better OCR

## Check Ollama Status

```powershell
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check model is downloaded
ollama list

# View logs
ollama serve  # in separate terminal
```

## System Requirements

- **RAM:** 8GB minimum, 16GB recommended
- **First load:** 1-2 minutes to warm up model
- **Subsequent requests:** 5-30 seconds

## Fallback Behavior

If Ollama fails, the app automatically falls back to OCR-only mode. You don't need to restart anything - it just works!
