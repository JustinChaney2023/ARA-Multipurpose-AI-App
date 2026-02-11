# DeepSeek for OCR

## DeepSeek Models for OCR/Vision

DeepSeek offers vision-capable models that can read images directly:

### DeepSeek-VL (Vision-Language)
- **deepseek-vl:7b** - 7B parameter vision model
- **deepseek-vl:1.3b** - Smaller, faster version

### DeepSeek-Coder-V2
- Also has vision capabilities
- Good at structured data extraction

## Setup

```powershell
# Pull DeepSeek vision model
ollama pull deepseek-vl:7b

# Or smaller version
ollama pull deepseek-vl:1.3b
```

## Configuration

```powershell
$env:OLLAMA_MODEL="deepseek-vl:7b"
npm run dev:service
```

## Comparison

| Model | Size | OCR Quality | Speed |
|-------|------|-------------|-------|
| deepseek-vl:1.3b | 1.3GB | Good | Fast |
| deepseek-vl:7b | 7GB | Excellent | Slow |
| llava:7b | 3.8GB | Good | Medium |
| moondream | 1.6GB | Basic | Fastest |

## When to Use DeepSeek

**Use DeepSeek-VL when:**
- You have complex handwritten forms
- Need excellent OCR accuracy
- Have GPU or powerful CPU
- Can wait 30-60 seconds per image

**Use smaller models when:**
- Need fast results
- Running on CPU-only laptop
- Documents are typed (not handwritten)

## Testing DeepSeek

```powershell
# Test model
ollama run deepseek-vl:7b

# Then type:
"Read this text: [paste OCR text]"

# Or for images (when using API):
# The app will automatically send the image to the model
```

## Implementation Status

Currently supported models in the app:
- qwen:4b / qwen2.5 series
- llava series
- phi3 series
- moondream
- deepseek-vl (should work)

To add DeepSeek officially, update the model detection:
```typescript
// In ollama.ts
const multimodalModels = ['llava', 'bakllava', 'moondream', 'cogvlm', 'deepseek-vl'];
```
