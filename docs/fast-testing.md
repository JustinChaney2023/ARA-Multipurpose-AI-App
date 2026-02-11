# Fast Testing with Small LLMs

## Option 1: Use Tiny Models (Recommended)

Pull a small model (500MB - 2GB):

```powershell
# Option A: Qwen 0.5B - smallest and fastest
ollama pull qwen2.5:0.5b

# Option B: Phi3 Mini - good balance
ollama pull phi3:mini

# Option C: Qwen 1.8B - slightly better quality
ollama pull qwen2.5:1.8b
```

Set the model:
```powershell
$env:OLLAMA_MODEL="qwen2.5:0.5b"
npm run dev:service
```

## Option 2: Disable LLM Completely

For testing without any LLM:

```powershell
$env:DISABLE_LLM="true"
npm run dev:service
```

This uses rule-based parsing only (fast but less accurate).

## Model Comparison

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| qwen2.5:0.5b | 500MB | Very Fast | Basic |
| phi3:mini | 2GB | Fast | Good |
| qwen2.5:1.8b | 1.1GB | Fast | Better |
| qwen:4b | 2.3GB | Slow | Best |

## Timeout Changes

With small models, timeouts are reduced:
- Form filling: 1 minute (was 5-10 minutes)
- Summary: 30 seconds (was 2 minutes)

## Testing Checklist

1. Pull small model: `ollama pull qwen2.5:0.5b`
2. Set env: `$env:OLLAMA_MODEL="qwen2.5:0.5b"`
3. Restart service
4. Upload document
5. Click "Auto-Fill" - should complete in 10-30 seconds

## Troubleshooting

If it still hangs:
- Check Ollama: `curl http://localhost:11434/api/tags`
- Try manual test: `ollama run qwen2.5:0.5b "Say hello"`
- Use `DISABLE_LLM=true` as fallback
